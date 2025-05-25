"use client";
import React, { useState, useRef, useEffect } from "react";
import styles from "./page.module.css";

// Types for conversation
interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful assistant that helps users book an Uber ride. Use this efficient flow:

1. In your very first message, ask for BOTH the user's name and ID together, in a single sentence. Do NOT ask for them separately. Example: "Welcome! To get started, please tell me your full name and your ID number (e.g., 'John Doe, 123456')." Wait for the user to provide both before moving on. If the user only provides one, politely remind them to provide both in a single message.
2. Next, ask for the pickup and dropoff locations together in one message.
3. Then, offer a list of available products (UberX, Comfort, Green). For each product, show the expected ETA (between 2-7 minutes) and an estimated price in USD (between $10-$50). Present the options in a clear, easy-to-choose list.
4. Wait for the user to choose a product.
5. Confirm the booking summary, including all details: name, ID, pickup, dropoff, chosen product, ETA, price, a randomly generated driver name, and a randomly generated license plate number. Use a clear, structured format with one line per detail and a relevant emoji for each. Use a line break (\\n) after each information point so each appears on its own line.

Example for product list:
Please choose a ride option:\n1. UberX 🚗 - ETA: 3 min - $15\n2. Comfort 🚘 - ETA: 5 min - $22\n3. Green 🚙 - ETA: 4 min - $18\n(Reply with the number or name of your choice.)

After the user chooses, confirm the booking as described above.`;

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export default function VoiceUberAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Welcome! To get started, please tell me your full name and your ID number (e.g., 'John Doe, 123456')." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle audio recording
  const handleRecord = async () => {
    setError(null);
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToWhisper(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      mediaRecorder.start();
    } catch (err) {
      setError("Could not access microphone.");
    }
  };

  // Send audio to Whisper API and send to OpenAI
  const sendAudioToWhisper = async (audioBlob: Blob) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      const res = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.text) {
        // Immediately send the transcribed text as a message
        setMessages((prev) => [...prev, { role: "user", content: data.text }]);
        await sendMessageToOpenAI(data.text);
      } else {
        setError("Could not transcribe audio.");
      }
    } catch (e) {
      setError("Error sending audio to server.");
    }
    setLoading(false);
  };

  // Extracted logic to send message to OpenAI
  const sendMessageToOpenAI = async (userInput: string) => {
    setLoading(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      const chatMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
        { role: "user", content: userInput },
      ].map(({ role, content }) => ({ role, content }));
      const res = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: chatMessages,
          max_tokens: 150,
        }),
      });
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || "Sorry, I didn't get that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, there was an error." }]);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userInput = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userInput }]);
    await sendMessageToOpenAI(userInput);
  };

  return (
    <div className={styles.assistantContainer}>
      <div className={styles.chatHeader}>
        <div className={styles.uberLogo}>UBER</div>
        <div className={styles.bookingStatus}>Booking Assistant</div>
      </div>
      
      <div className={styles.messagesContainer}>
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`${styles.messageWrapper} ${msg.role === 'assistant' ? styles.assistantWrapper : styles.userWrapper}`}
          >
            <div className={`${styles.message} ${msg.role === 'assistant' ? styles.assistantMessage : styles.userMessage}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className={styles.loadingWrapper}>
            <div className={styles.loadingDots}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.voiceButtonContainer}>
        <button
          type="button"
          onClick={handleRecord}
          className={styles.voiceCircleButton + (recording ? ' ' + styles.voiceCircleButtonActive : '')}
          disabled={loading}
          aria-label={recording ? "Stop recording" : "Start recording"}
        >
          {recording ? (
            <span role="img" aria-label="Stop" style={{ fontSize: 36, color: '#fff' }}>⏹️</span>
          ) : (
            <span role="img" aria-label="Speak" style={{ fontSize: 36, color: '#fff' }}>🎤</span>
          )}
        </button>
      </div>
      {error && <div style={{ color: 'red', padding: 8 }}>{error}</div>}
    </div>
  );
} 
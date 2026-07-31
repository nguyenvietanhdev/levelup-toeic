import { useEffect, useRef, useState, useCallback } from 'react';
import { Notification } from '@ui/Toaster.jsx';

const PART_INSTRUCTIONS = {
    1: 'Part 1: Photographs. Directions: For each question, you will see a photograph. You will hear four statements about the photograph. Select the statement that best describes what you see in the photograph. The statements are not printed and will only be spoken one time. ',
    2: 'Part 2: Question-Response. Directions: You will hear a question or statement followed by three responses. Select the best response. The questions and responses are not printed and will only be spoken one time. ',
    3: 'Part 3: Conversations. Directions: You will hear conversations between two or more people. You will be asked to answer questions about what the speakers say. Select the best response to each question. ',
    4: 'Part 4: Talks. Directions: You will hear short talks given by a single speaker. You will be asked to answer questions about what the speaker says. Select the best response to each question. ',
};

const PART_BASE_RATE = { 1: 0.85, 2: 0.9, 3: 0.95, 4: 0.9 };

function pickVoice(part) {
    const voices = window.speechSynthesis.getVoices();
    const en = voices.filter(v => v.lang.startsWith('en-'));
    if (en.length === 0) return null;

    const males = en.filter(v => /Male|David|James|Mark/.test(v.name));
    const females = en.filter(v => /Female|Samantha|Susan|Karen|Zira/.test(v.name));

    const useFemale = Math.random() > 0.5;
    if (useFemale && females.length) return females[Math.floor(Math.random() * females.length)];
    if (!useFemale && males.length) return males[Math.floor(Math.random() * males.length)];
    return en[Math.floor(Math.random() * en.length)];
}

/**
 * Audio playback hook for TOEIC test.
 * Supports: real audio (URL) and TTS (text).
 * Tracks `finished` state and notifies via onFinished callback.
 */
export function useToeicAudio({ onFinished, onProgress } = {}) {
    const [playing, setPlaying] = useState(false);
    const [finished, setFinished] = useState(false);
    const audioRef = useRef(null);
    const speechRef = useRef(null);
    const onFinishedRef = useRef(onFinished);
    onFinishedRef.current = onFinished;
    // onProgress({ duration, currentTime }) — để vẽ thanh nhịp cho Part Nghe theo
    // độ dài file audio. Chỉ có với audio THẬT (TTS không biết trước độ dài).
    const onProgressRef = useRef(onProgress);
    onProgressRef.current = onProgress;

    const stop = useCallback(() => {
        if (speechRef.current) {
            window.speechSynthesis.cancel();
            speechRef.current = null;
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        setPlaying(false);
    }, []);

    const playRealAudio = useCallback((url) => {
        stop();
        try {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = url;
            audio.onplay = () => setPlaying(true);
            audio.onloadedmetadata = () => onProgressRef.current?.({ duration: audio.duration, currentTime: 0 });
            audio.ontimeupdate = () => onProgressRef.current?.({ duration: audio.duration, currentTime: audio.currentTime });
            audio.onended = () => {
                setPlaying(false);
                setFinished(true);
                audioRef.current = null;
                onFinishedRef.current?.();
            };
            audio.onerror = () => {
                setPlaying(false);
                audioRef.current = null;
                Notification.error('Không thể phát file audio. Vui lòng kiểm tra file.');
            };
            audioRef.current = audio;
            audio.load();
            audio.play().catch(err => {
                console.error('Play failed:', err);
                setPlaying(false);
            });
        } catch (err) {
            console.error('Error playing audio:', err);
            setPlaying(false);
        }
    }, [stop]);

    const playTTS = useCallback((text, { part = 1, isFirstOfPart = false } = {}) => {
        stop();
        if (!('speechSynthesis' in window)) {
            Notification.error('Trình duyệt không hỗ trợ phát âm thanh');
            return;
        }

        let fullText = text;
        if (isFirstOfPart && PART_INSTRUCTIONS[part]) {
            fullText = PART_INSTRUCTIONS[part] + ' Now listen to the audio. ' + text;
        }

        const utterance = new SpeechSynthesisUtterance(fullText);
        utterance.lang = 'en-US';

        const userRate = parseInt(localStorage.getItem('toeic_speech_rate') || '100') / 100;
        utterance.rate = Math.min(2.0, (PART_BASE_RATE[part] || 0.9) * userRate);
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        const voice = pickVoice(part);
        if (voice) utterance.voice = voice;

        utterance.onstart = () => setPlaying(true);
        utterance.onend = () => {
            setPlaying(false);
            setFinished(true);
            speechRef.current = null;
            onFinishedRef.current?.();
        };
        utterance.onerror = () => {
            setPlaying(false);
            speechRef.current = null;
            Notification.error('Không thể phát âm thanh. Vui lòng thử lại.');
        };

        speechRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, [stop]);

    const resetFinished = useCallback(() => setFinished(false), []);

    useEffect(() => () => stop(), [stop]);

    return { playing, finished, playRealAudio, playTTS, stop, resetFinished };
}

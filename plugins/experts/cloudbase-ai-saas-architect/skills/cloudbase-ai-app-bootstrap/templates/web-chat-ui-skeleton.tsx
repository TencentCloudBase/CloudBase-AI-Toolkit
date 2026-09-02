// path: web/components/ChatUI.tsx
// Web 聊天 UI 骨架（流式 SSE 消费）
//
// 依赖: @cloudbase/js-sdk v3 (Web SDK)
// 参考文档: CloudBase 连接器 references/ai-model-web/SKILL.md

'use client';

import { useState, useRef } from 'react';
import { cloud } from '@/lib/cloudbase'; // app = cloud.init({env, ...})

const ai = cloud.ai();

export default function ChatUI() {
  const [messages, setMessages] = useState<{role: string; content: string}[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    if (!input.trim() || streaming) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1. 创建模型 — GroupName
      const model = ai.createModel('cloudbase');

      // 2. 流式输出
      const stream = await model.streamText({
        model: 'hunyuan-exp',
        messages: [...messages, userMsg],
      });

      // 3. 流式渲染
      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      for await (const chunk of stream) {
        assistantContent += chunk.text || '';
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: assistantContent };
          return next;
        });
      }
    } catch (err) {
      console.error('Stream error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: `[错误] ${err}` }]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block px-3 py-2 rounded-lg ${
              m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}>
              {m.content || '...'}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t p-4 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="输入消息..."
          className="flex-1 border rounded px-3 py-2"
          disabled={streaming}
        />
        {streaming ? (
          <button onClick={stop} className="px-4 py-2 bg-red-500 text-white rounded">停止</button>
        ) : (
          <button onClick={send} className="px-4 py-2 bg-blue-500 text-white rounded">发送</button>
        )}
      </div>
    </div>
  );
}

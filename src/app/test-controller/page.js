'use client';

import { useState } from 'react';
import { toggleLight } from '@/lib/access-control';

export default function TestControllerPage() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const deviceId = 'door-controller-01'; // Hardcoded for testing

  const handleToggle = async () => {
    setLoading(true);
    setStatus('Sending command...');
    try {
      // Note: In a real app, you'd call a Server Action here, 
      // but since we are calling an external API (localhost:3001), 
      // we can call it directly if CORS allows, or wrap it in a server action.
      // For simplicity in this test page, we'll assume we can call the lib function 
      // which calls the API. However, since the API is on localhost:3001 and this 
      // runs in the browser, we might hit CORS or network issues if not proxied.
      // 
      // To be safe and follow Next.js patterns, let's use a server action wrapper.
      // But since I can't easily create a separate file right here without more tool calls,
      // I will try to call an internal API route that I will create, OR just use a server action
      // defined in this file if I were using the 'use server' directive at the top of a separate function.
      
      // Let's try calling a new API route we'll create: /api/test-toggle
      
      const res = await fetch('/api/test-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setStatus(`Success: ${data.message}`);
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Controller Test</h1>
      
      <div className="bg-gray-100 p-6 rounded-lg shadow-md">
        <p className="mb-4">Device ID: <code className="bg-gray-200 px-1 rounded">{deviceId}</code></p>
        
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`w-full py-3 px-4 rounded-md text-white font-medium transition-colors ${
            loading 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Sending...' : 'Toggle Light'}
        </button>
        
        {status && (
          <div className={`mt-4 p-3 rounded text-sm ${status.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

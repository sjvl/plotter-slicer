import React, { useState, useEffect, useRef } from 'react';


const SerialConnection = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [port, setPort] = useState(null);
    const [messages, setMessages] = useState([]);
  
    const connect = async () => {
      try {
        // Vérifier que l'API est disponible
        if (!navigator.serial) {
          throw new Error('Web Serial API not supported. Please use Chrome or Edge.');
        }
  
        // Demander l'accès au port
        const selectedPort = await navigator.serial.requestPort();
        await selectedPort.open({ baudRate: 115200 });
        
        setPort(selectedPort);
        setIsConnected(true);
        setMessages(prev => [...prev, 'Connected to port']);
  
        // Commencer à lire les réponses
        while (selectedPort.readable) {
          const reader = selectedPort.readable.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              
              // Convertir le Uint8Array en string
              const text = new TextDecoder().decode(value);
              setMessages(prev => [...prev, `Received: ${text}`]);
            }
          } catch (error) {
            console.error('Error reading data:', error);
          } finally {
            reader.releaseLock();
          }
        }
  
      } catch (error) {
        console.error('Connection failed:', error);
        setMessages(prev => [...prev, `Error: ${error.message}`]);
      }
    };
  
    const disconnect = async () => {
      try {
        if (port) {
          await port.close();
          setPort(null);
          setIsConnected(false);
          setMessages(prev => [...prev, 'Disconnected from port']);
        }
      } catch (error) {
        console.error('Disconnection failed:', error);
        setMessages(prev => [...prev, `Error: ${error.message}`]);
      }
    };
  
    return (
      <div className="p-4 border rounded-lg">
        <h2 className="text-lg font-bold mb-4">Serial Connection</h2>
        
        <button
          onClick={isConnected ? disconnect : connect}
          className={`px-4 py-2 rounded ${
            isConnected 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-blue-500 hover:bg-blue-600'
          } text-white`}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
  
        <div className="mt-4 p-2 bg-gray-100 rounded max-h-40 overflow-auto">
          {messages.map((msg, index) => (
            <div key={index} className="text-sm">
              {msg}
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  export default SerialConnection;
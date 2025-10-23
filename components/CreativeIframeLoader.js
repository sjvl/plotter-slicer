// components/CreativeIframeLoader.js

import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';

const CreativeIframeLoader = ({ onSVGImport }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [proxiedHtml, setProxiedHtml] = useState('');
  const [loadingProxy, setLoadingProxy] = useState(false);
  const [proxyError, setProxyError] = useState(null);
  const [hasUrlParam, setHasUrlParam] = useState(false);
  const iframeRef = useRef(null);

  // Vérifier si l'URL contient le paramètre et charger automatiquement
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlParam = urlParams.get('url');
    
    if (urlParam) {
      setHasUrlParam(true);
      setCurrentUrl(urlParam);
      loadProxiedUrl(urlParam);
      setIsOpen(true); // Ouvrir automatiquement
    }
  }, []);

  // Script d'interception à injecter
  const injectionScript = `
    <script>
      (function() {
        console.log('🎯 SVG interceptor loaded in proxied iframe');
        const originalCreateObjectURL = URL.createObjectURL;
        const blobUrls = new Map();
        
        URL.createObjectURL = function(blob) {
          const url = originalCreateObjectURL.call(this, blob);
          
          console.log('Blob created:', blob.type, blob.size);
          
          if (blob.type === 'image/svg+xml' || 
              blob.type === 'image/svg' || 
              blob.type === '' ||
              blob.type === 'application/octet-stream') {
            
            // Stocker le blob pour pouvoir le bloquer plus tard
            blobUrls.set(url, blob);
            
            const reader = new FileReader();
            reader.onload = (e) => {
              const content = e.target.result;
              if (content.trim().startsWith('<svg') || 
                  content.includes('xmlns="http://www.w3.org/2000/svg"')) {
                console.log('📤 Sending SVG to parent window');
                window.parent.postMessage({
                  type: 'SVG_INTERCEPTED',
                  content: content,
                  blobUrl: url
                }, '*');
              }
            };
            reader.readAsText(blob);
          }
          
          return url;
        };

        // Intercepter les clics sur les liens de téléchargement
        document.addEventListener('click', (e) => {
          const link = e.target.closest('a[download]');
          if (link) {
            const href = link.getAttribute('href');
            const downloadAttr = link.getAttribute('download');
            
            if (href && href.startsWith('blob:') && blobUrls.has(href)) {
              console.log('🚫 Blocking SVG download');
              
              // Récupérer le nom du fichier depuis l'attribut download
              const blob = blobUrls.get(href);
              const fileName = downloadAttr || 'generated.svg';
              
              // Envoyer le nom avec le contenu
              const reader = new FileReader();
              reader.onload = (ev) => {
                const content = ev.target.result;
                if (content.trim().startsWith('<svg') || 
                    content.includes('xmlns="http://www.w3.org/2000/svg"')) {
                  window.parent.postMessage({
                    type: 'SVG_INTERCEPTED',
                    content: content,
                    fileName: fileName.replace('.svg', '')
                  }, '*');
                }
              };
              reader.readAsText(blob);
              
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          }
        }, true);

        console.log('✅ URL.createObjectURL patched and download blocker installed');
      })();
    </script>
  `;

  // Charger et proxifier l'URL
  const loadProxiedUrl = async (targetUrl) => {
    setLoadingProxy(true);
    setProxyError(null);
    setProxiedHtml('');
    
    try {
      console.log('🔄 Fetching and proxying:', targetUrl);
      const response = await fetch(targetUrl);
      let html = await response.text();
      
      // Obtenir l'URL de base pour les chemins relatifs
      const baseUrl = new URL(targetUrl).origin + new URL(targetUrl).pathname.replace(/[^/]*$/, '');
      
      // Ajouter une balise <base> pour résoudre les chemins relatifs
      const baseTag = `<base href="${baseUrl}">`;
      html = html.replace('<head>', `<head>${baseTag}`);
      
      // Injecter le script d'interception juste après <head>
      html = html.replace('<head>', `<head>${injectionScript}`);
      
      console.log('✅ HTML proxied and interceptor injected');
      setProxiedHtml(html);
      setLoadingProxy(false);
    } catch (err) {
      console.error('❌ Proxy error:', err);
      setProxyError(err.message);
      setLoadingProxy(false);
    }
  };

  // Écouter les messages de l'iframe
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'SVG_INTERCEPTED') {
        console.log('📥 SVG received from proxied iframe!');
        if (onSVGImport) {
            // Passer le contenu ET le nom du fichier
            setIsOpen(false);
            setTimeout(() => {
                onSVGImport(event.data.content, event.data.fileName || 'generated');
            }, 0);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onSVGImport]);

//   const handleLoadUrl = () => {
//     if (url.trim()) {
//       setCurrentUrl(url.trim());
//       loadProxiedUrl(url.trim());
//     }
//   };

  // Ne rien afficher si pas de paramètre URL
  if (!hasUrlParam) {
    return null;
  }

  return (
    <>
      {/* Poignée pour ouvrir */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-1/2 right-0 -translate-y-1/2 bg-gray-400 hover:bg-blue-600 px-1.5 py-3 rounded-l-md shadow-md z-50 transition-all flex flex-col gap-1 items-center"
          title="Open Creative Projects"
        >
          <span className="w-1 h-1 bg-white rounded-full"></span>
          <span className="w-1 h-1 bg-white rounded-full"></span>
          <span className="w-1 h-1 bg-white rounded-full"></span>
        </button>
      )}

      {/* Overlay semi-transparent */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        />
      )}

      {/* Poignée pour fermer (suit l'animation du panneau) */}
      <button
        onClick={() => setIsOpen(false)}
        className={`fixed top-1/2 -translate-y-1/2 bg-gray-400 hover:bg-blue-600 px-1.5 py-3 rounded-l-md shadow-md z-[60] transition-all duration-300 ease-in-out flex flex-col gap-1 items-center ${
          isOpen ? 'right-[74%]' : 'right-0 opacity-0 pointer-events-none'
        }`}
        title="Close"
      >
        <span className="w-1 h-1 bg-white rounded-full"></span>
        <span className="w-1 h-1 bg-white rounded-full"></span>
        <span className="w-1 h-1 bg-white rounded-full"></span>
      </button>

      {/* Panneau sliding */}
      <div
        className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-50 transition-all duration-300 ease-in-out ${
          isOpen ? 'w-[74%]' : 'w-0'
        } overflow-hidden`}
      >
        <div className="h-full flex flex-col">
          {/* Iframe */}
          <div className="flex-1 relative overflow-hidden" onClick={() => iframeRef.current?.focus()}>
            {proxiedHtml ? (
              <iframe
                ref={iframeRef}
                srcDoc={proxiedHtml}
                className="w-full h-full border-0"
                sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-modals"
                title="Creative Project"
                allow="camera *; microphone *"
              />
            ) : currentUrl && !loadingProxy && proxyError ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-red-500">❌ Loading failed</p>
                  <p className="text-sm mt-2">The site may block proxying</p>
                </div>
              </div>
            ) : loadingProxy ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p>Loading...</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <ExternalLink size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Enter a URL to load a creative project</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CreativeIframeLoader;
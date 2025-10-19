// hooks/useDragAndDrop.js

import { useState } from 'react';

/**
 * Hook personnalisé pour gérer le drag & drop de fichiers SVG
 * @param {Function} onFileLoaded - Callback appelé avec le contenu du fichier
 * @param {Function} setFileName - Setter pour le nom du fichier
 * @returns {Object} Handlers et état pour le drag & drop
 */
export function useDragAndDrop(onFileLoaded, setFileName) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Vérifier qu'on quitte vraiment la zone (et pas juste un enfant)
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.svg')) {
        const text = await file.text();
        setFileName(file.name.replace('.svg', ''));
        await onFileLoaded(text);
      } else {
        alert('Please drop an SVG file');
      }
    }
  };

  return {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
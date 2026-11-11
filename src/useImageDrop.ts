import {useEffect, useState} from 'react';

export function useImageDrop(enabled: boolean, onImage: (file: File) => void, onInvalid: () => void) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
    const reset = () => {
      depth = 0;
      setDragging(false);
    };
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const leave = (event: DragEvent) => {
      if (hasFiles(event) && --depth <= 0) reset();
    };
    const drop = (event: DragEvent) => {
      reset();
      if (!hasFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith('image/'));
      if (image) onImage(image);
      else onInvalid();
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('blur', reset);
    };
  }, [enabled, onImage, onInvalid]);

  return dragging;
}

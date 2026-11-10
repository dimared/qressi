import {useEffect, useState} from 'react';
import Dialog from './Dialog';

export default function PrivacyDocument({onClose}: {onClose: () => void}) {
  const [text, setText] = useState('Загрузка…');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}PRIVACY.md`, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error('Документ недоступен.');
        return response.text();
      })
      .then(setText)
      .catch((error) => {
        if (!controller.signal.aborted) setText(String(error));
      });
    return () => controller.abort();
  }, []);
  return (
    <Dialog title="Конфиденциальность" onClose={onClose} wide>
      <pre className="privacy-text">{text}</pre>
    </Dialog>
  );
}

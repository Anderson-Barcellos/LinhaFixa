import { apiUrl } from './apiBase';

export async function getReadingContent(complexity: 'facil' | 'dificil'): Promise<string> {
   try {
     const response = await fetch(apiUrl('/api/generateReadingContent'), {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ complexity })
     });
     if (response.ok) {
       const data = await response.json();
       if (data.text) {
          return data.text;
       }
     }
   } catch (e) {
      console.error('Falha ao solicitar texto de leitura por IA.', e);
   }

   throw new Error(`Não foi possível gerar o texto de leitura por IA (${complexity}).`);
}

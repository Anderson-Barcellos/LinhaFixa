export async function getReadingContent(complexity: 'facil' | 'dificil'): Promise<string> {
   try {
     const response = await fetch('/api/generateReadingContent', {
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
   } catch(e) {
      console.error(e);
   }
   
   // Fallbacks offline/error
   if (complexity === 'facil') {
      return "A inteligência artificial ajuda muitos programadores todos os dias. Ela pode achar erros no código de forma rápida e segura. Muitas pessoas usam a IA para tirar dúvidas. No futuro, ela será ainda mais presente. É como ter um assistente digital inteligente que nunca descansa ou se cansa.";
   } else {
      return "A inteligência artificial generativa, baseada fortemente em arquiteturas de redes neurais profundas, permite aos desenvolvedores contemporâneos abstraírem rotinas e tarefas repetitivas, otimizando pipelines complexos. Essa tecnologia, contudo, requer atenção constante e redobrada à escalabilidade sistêmica, demandando eficiência energética substancial dos servidores em nuvem.";
   }
}

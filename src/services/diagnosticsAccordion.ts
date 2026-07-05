// Alternância do acordeão da gaveta de diagnóstico (mobile): um card aberto
// por vez; tocar no card aberto fecha tudo.
export type SectionId = 'metrics' | 'signal' | 'conditions' | 'interpret';

export function toggleSection(current: SectionId | null, id: SectionId): SectionId | null {
  return current === id ? null : id;
}

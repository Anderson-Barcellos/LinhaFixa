import { SymptomRating } from '@/types';

export function checkSymptomsSafety(symptoms: SymptomRating): { safe: boolean; reason?: string } {
  const HIGH_THRESHOLD = 7;
  const criticalFactors = [];
  
  if (symptoms.dorOcular >= HIGH_THRESHOLD) criticalFactors.push('dor ocular elevada');
  if (symptoms.cefaleia >= HIGH_THRESHOLD) criticalFactors.push('cefaleia elevada');
  if (symptoms.visaoDupla >= HIGH_THRESHOLD) criticalFactors.push('visão dupla intensa');
  if (symptoms.tontura >= HIGH_THRESHOLD) criticalFactors.push('tontura severa');
  if (symptoms.nausea >= HIGH_THRESHOLD) criticalFactors.push('náusea severa');

  if (criticalFactors.length > 0) {
    return {
      safe: false,
      reason: `Atenção: ${criticalFactors.join(', ')}. Interrompa o exercício e procure seu especialista.`
    };
  }

  return { safe: true };
}

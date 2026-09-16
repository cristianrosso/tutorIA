export type UnitDefinition = { number: number; name: string };

export const OFFICIAL_UNITS: UnitDefinition[] = [
  { number: 1, name: "Doctrina Policial" },
  { number: 2, name: "Patrullaje Policial" },
  { number: 3, name: "Seguridad de Instalaciones" },
  { number: 4, name: "Investigación Criminal" },
  {
    number: 5,
    name: "Educación Vial e Investigación de Accidentes de Tránsito",
  },
  { number: 6, name: "Operaciones Policiales" },
  { number: 7, name: "Fundamentos Jurídicos de la Función Policial" },
  { number: 8, name: "Derechos Humanos Aplicados a la Función Policial" },
  {
    number: 9,
    name: "Derecho Penal y Derecho Procesal Penal Aplicados a la Función Policial",
  },
  { number: 10, name: "Género y Violencia Intrafamiliar" },
  { number: 11, name: "Legislación Policial y Seguridad Ciudadana" },
  { number: 12, name: "Expresión Oral, Ética y Relaciones Humanas" },
  { number: 13, name: "Psicología Aplicada a la Función Policial" },
  { number: 14, name: "Soporte Vital Básico (Técnica MARCH)" },
  { number: 15, name: "Metodología de la Investigación Científica" },
];

export function unitName(number: number) {
  return (
    OFFICIAL_UNITS.find((unit) => unit.number === number)?.name ||
    `Unidad ${number}`
  );
}

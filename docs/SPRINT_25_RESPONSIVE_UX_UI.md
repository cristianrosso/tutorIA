# Sprint 25 — UX/UI responsivo, navegación avanzada y preservación funcional

## Alcance aplicado

Este sprint se aplicó como una capa visual y de navegación sobre la arquitectura actual de Tutor IA multi-producto. No se modificaron motores académicos, RAG, prompts, modelos, embeddings, licencias, permisos, reglas de evaluación, reglas de simulacro ni políticas RLS.

La prioridad fue mejorar la usabilidad en escritorio, tablet y móvil sin romper las rutas ni los flujos existentes.

## Inventario visual y funcional revisado

Se revisaron los puntos centrales de la interfaz actual:

- `AppShell`: layout principal, sidebar, header, perfil y salida.
- Sidebar estudiante y administrador: navegación larga y necesidad de scroll independiente.
- Header superior: breadcrumb, perfil, estado de gestión y espacio para búsqueda.
- Mis preparaciones: tarjetas multi-producto.
- Mis unidades: tarjetas de materias/unidades, acciones Estudiar, Hablar, Práctica y Simulacro.
- Tutor IA: chat pedagógico, controles de modo, voz, mensajes, fuentes y compositor.
- Clase, práctica y simulacro: layouts por tarjetas y acciones principales.
- Progreso, analítica, recomendaciones y plan de estudio: grids, paneles y tarjetas.
- Administración: submenú, tablas, formularios, materiales/conocimiento, productos, estudiantes, licencias, costos y auditoría.

## Sistema visual

Se añadieron tokens CSS institucionales para unificar el diseño:

- Verdes olivo: `--olive-900`, `--olive-800`, `--olive-700`, `--olive-600`, `--olive-500`, `--olive-100`.
- Dorado moderado: `--gold-500`, `--gold-300`.
- Cremas: `--cream-50`, `--cream-100`.
- Superficies: `--surface`, `--surface-muted`, `--border`.
- Texto y estados: `--text-primary`, `--text-secondary`, `--success`, `--warning`, `--danger`.

La identidad FATESCIPOL mantiene el verde olivo profundo, blanco cálido, crema y dorado moderado.

## Layout principal

Se mejoró el shell principal:

- Sidebar con `height: 100svh` y `overflow-y: auto`.
- Header sticky con fondo translúcido y blur ligero.
- Contenido principal con ancho máximo controlado para evitar pantallas demasiado extendidas.
- Eliminación de scroll horizontal global mediante reglas de ancho y overflow.
- Mejor jerarquía visual en paneles, tarjetas y botones.

## Header y búsqueda

Se añadió una barra de búsqueda visible en el header:

- Placeholder: `Buscar temas, materias o preguntas...`.
- En administrador dirige al área de búsqueda de conocimiento.
- En estudiante conserva rutas existentes y queda preparada para búsqueda académica sin modificar motores.

## Sidebar

El sidebar ahora:

- Tiene scroll independiente.
- Mantiene navegación completa para estudiante y administrador.
- Mejora estados hover/activo.
- En móvil pasa a navegación superior horizontal con scroll accesible para no ocultar opciones.

## Mis unidades / materias

La vista de contenidos conserva la jerarquía corregida:

- Curso.
- Materias/asignaturas o unidades según producto.
- Temas y subtemas al ingresar.

Las tarjetas se adaptan con `auto-fit` y títulos largos sin altura fija. Las acciones quedan visibles y en móvil se apilan cuando corresponde.

## Tutor IA

Se mejoró el chat:

- El hilo de mensajes tiene scroll independiente.
- El compositor queda sticky en la parte inferior del panel.
- Los controles de modo y acciones rápidas admiten scroll horizontal en pantallas pequeñas.
- La sección de voz mantiene botones visibles y accesibles.
- El auto-scroll ahora es menos agresivo: si el usuario lee mensajes anteriores, aparece el botón `Volver al último mensaje`.

## Simulador y práctica

Se añadieron reglas visuales para mantener visibles las acciones principales:

- Botones de avance/respuesta con comportamiento sticky cuando aplica.
- Grids responsivos.
- Botones grandes en móvil.
- Sin cambio de reglas de evaluación o simulacro.

## Administración

La navegación administrativa se optimizó:

- Submenú sticky y con scroll horizontal controlado.
- Tablas con overflow interno, evitando scroll horizontal global.
- Filas administrativas se apilan en pantallas pequeñas donde ya existían media queries.
- Formularios mantienen labels visibles y pasan a una columna en móvil.

## Breakpoints aplicados

Se reforzó la experiencia en:

- 320 px.
- 360 px.
- 430 px.
- 720 px.
- 900 px.
- 1150 px.
- Escritorio amplio con ancho máximo.

## Accesibilidad

Se preservó y reforzó:

- `skip-link` existente.
- Estados `focus-visible`.
- Tamaños mínimos táctiles de botones.
- Inputs legibles en móvil para evitar zoom inesperado.
- Scrolls accesibles sin bloqueo con JavaScript.
- Reducción de animaciones con `prefers-reduced-motion`.

## Componentes modificados

- `src/components/app-shell.tsx`
- `src/components/tutor/tutor-chat.tsx`
- `src/app/globals.css`

## Componentes creados

No se creó un nuevo componente React. El sprint se resolvió con mejoras sobre componentes existentes para reducir riesgo funcional.

## Funcionalidades no modificadas

No se modificó:

- RAG.
- MKF-1.
- Prompts académicos.
- Modelos.
- Embeddings.
- Voz backend.
- Evaluaciones.
- Simuladores.
- Licencias.
- RLS.
- Seguridad.
- Costos.
- Multi-producto.
- Publicación de conocimiento.

## Checklist de pruebas visuales sugeridas

- Sidebar largo en desktop y móvil.
- Header sticky.
- Mis preparaciones en desktop/tablet/móvil.
- Mis unidades/materias con títulos largos.
- Tutor con conversación larga.
- Tutor con teclado móvil abierto.
- Botón `Volver al último mensaje`.
- Voz en chat pedagógico.
- Simulador con pregunta larga.
- Admin con tablas anchas.
- Conocimiento con submenú administrativo.
- Formularios largos.

## Validaciones ejecutadas\n\n- `npm.cmd run lint`: correcto.\n- `npm.cmd run typecheck`: correcto.\n- `npm.cmd run build`: correcto.

## Limitaciones

- La búsqueda global se integró como mejora visual y punto de entrada, sin rediseñar el motor de búsqueda para cumplir la restricción de no modificar lógica académica.
- Se intentaron capturas locales con Playwright. La sesión headless redirigió al login, por lo que no se conservaron capturas internas como evidencia final. Antes del despliegue pueden tomarse capturas manuales autenticadas si se requiere aprobación visual completa.
- El sprint se dejó sin despliegue automático porque la especificación indica esperar autorización antes de producción.

## Reversión

Para revertir este sprint:

1. Revertir el commit que contenga estos cambios.
2. Confirmar que `src/components/app-shell.tsx`, `src/components/tutor/tutor-chat.tsx` y `src/app/globals.css` vuelvan al estado anterior.
3. Ejecutar `npm.cmd run typecheck` y `npm.cmd run build`.
4. Desplegar solo después de verificar las rutas principales.



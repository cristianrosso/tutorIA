# Guía para crear un nuevo producto académico

Esta guía evita mezclar contenido entre cursos y mantiene la fuente oficial como autoridad académica.

## 1. Crear el producto contenedor

Ir a `/admin/products` y crear el producto con:

- nombre público;
- nombre corto;
- slug técnico;
- institución;
- nombre del examen;
- gestión;
- estado inicial.

Recomendación: usar estado `draft` hasta que exista una fuente revisada.

## 2. Cargar la fuente oficial

No se deben crear unidades, preguntas ni explicaciones sin documento oficial. Primero cargar el compendio o base documental desde el módulo de conocimiento.

Cada documento o versión debe quedar asociado al `product_id` del producto creado.

## 3. Procesar conocimiento

El flujo recomendado es:

1. subir documento;
2. extraer texto;
3. estructurar MKF-1;
4. revisar elementos dudosos;
5. publicar al RAG del producto.

No copiar contenido de FATESCIPOL a otro producto salvo que exista autorización académica y fuente oficial equivalente.

## 4. Licenciar estudiantes

Cada estudiante debe tener una licencia en `user_product_licenses` para el producto correspondiente. La licencia de FATESCIPOL no concede automáticamente acceso a Medicina, ESFM u otro curso.

## 5. Validar aislamiento

Antes de activar el producto:

- buscar contenido del nuevo producto y verificar que no aparece FATESCIPOL;
- buscar contenido FATESCIPOL y verificar que no aparece el nuevo producto;
- ejecutar una prueba RAG con `productId`;
- revisar consumo y costos por producto;
- comprobar que `/preparaciones` muestra solo los accesos vigentes del estudiante.

## 6. Activar

Cambiar el producto a `active` solo después de validar fuente, RAG, permisos y licencias.

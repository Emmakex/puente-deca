# DeCA Transporte para PrestaShop

Módulo instalable de **Cargo Connect** para **PrestaShop 1.7.8.x y 8.x**.

Versión actual del conector: **0.1.2**.

Su objetivo es reutilizar los datos del pedido y la información logística necesaria para crear o actualizar el DeCA, mantener el documento asociado a la operación y reducir la introducción manual de datos.

## Flujo

```text
Pedido PrestaShop
   |
datos del pedido + transporte
   |
crear/actualizar expedición DeCA
   |
generar/reutilizar/revisar DeCA
   |
estado + document ID + abrir documento
```

## Compatibilidad

- PrestaShop >= 1.7.8.0 y < 9.0.
- PHP 7.4+.
- cURL.
- libsodium u OpenSSL para cifrar la clave API.

PrestaShop 9 queda fuera del rango actual hasta que exista una necesidad real de producto y se valide específicamente.

## Instalación y primer DeCA

1. Instala `puentedeca-prestashop-0.1.2.zip` desde el gestor de módulos de PrestaShop.
2. Abre la configuración de **DeCA Transporte**.
3. La pantalla te indicará qué datos básicos faltan.
4. Guarda la clave API de Cargo Connect y los datos del cargador/origen.
5. Ejecuta **Probar conexión con DeCA Transporte**.
6. Abre un pedido y pulsa **Completar datos / generar DeCA**.
7. Completa únicamente los datos de transporte necesarios y pulsa **Guardar datos y generar / actualizar DeCA**.
8. Cuando esté listo, usa **Abrir documento DeCA** desde la ficha del pedido.

La configuración incluye un panel **Primer DeCA** con este recorrido y un enlace a la landing comercial canónica de DeCA Transporte.

## Actualización

- `0.1.1` añadió automáticamente `access_url` para conservar el enlace al documento.
- `0.1.2` mejora el onboarding y la experiencia de uso sin cambiar el esquema ni los identificadores persistidos.

El nombre técnico del módulo continúa siendo `puentedeca` para conservar compatibilidad.

## Configuración básica

La configuración es por tienda e incluye:

- endpoint HTTPS de DeCA Transporte;
- clave API de Cargo Connect;
- nombre legal, NIF/CIF y dirección del cargador contractual;
- origen de carga;
- transportista efectivo por defecto, si aplica.

La pantalla indica si esta configuración está completa. La clave API se cifra localmente y no vuelve a mostrarse después de guardarla.

## Opciones avanzadas

Al final del mismo formulario se mantienen, claramente marcadas como avanzadas:

- estados de pedido opcionales para procesamiento automático;
- timeout HTTP.

La automatización está desactivada por defecto. Sin estados configurados, el módulo funciona de forma manual.

## Datos de transporte del pedido

Desde el flujo del pedido se pueden guardar:

- fecha de transporte;
- matrícula tractora;
- matrícula de remolque opcional;
- nombre legal y NIF/CIF del transportista efectivo;
- peso total opcional en kg;
- autorización especial opcional.

El módulo no inventa fecha, matrícula, transportista ni peso. Si falta un dato obligatorio, la generación se detiene con un error útil.

## Peso

Si no existe un peso explícito, el módulo suma los pesos nativos de producto y convierte unidades habituales a kg. Si algún dato no permite calcular un peso fiable, no fabrica un valor.

## Documento y revisiones

La primera generación crea la expedición y el DeCA. Las siguientes reutilizan la misma identidad de expedición y actualizan el documento solo cuando existen cambios materiales, conservando la trazabilidad de revisiones.

La ficha del pedido muestra:

- estado del DeCA;
- identificador de expedición;
- identificador del DeCA;
- último error cuando existe;
- botón **Abrir documento DeCA**;
- acceso **Completar datos / generar DeCA**.

## Persistencia local

La tabla `pdeca_order_sync`, única por tienda + pedido, conserva únicamente el estado necesario del conector y los datos logísticos explícitos: identificadores de expedición/documento, URL de acceso, estado/error, fecha, matrículas, transportista, peso, autorización y fecha de actualización.

La clave API no se guarda en esa tabla.

## Seguridad

- endpoint obligatorio por HTTPS;
- clave API cifrada localmente;
- no se instala ningún secreto interno de plataforma en PrestaShop;
- no se copia la URL pública del DeCA en mensajes del pedido.

## Criterio de producto

Este módulo pertenece a **Cargo Connect**. Su recorrido mínimo es: instalar, completar la configuración básica, probar conexión, abrir un pedido, completar datos de transporte, generar/actualizar el DeCA y abrir el documento desde la propia operación.

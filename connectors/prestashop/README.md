# DeCA Transporte para PrestaShop

Módulo instalable de **Cargo Connect** para **PrestaShop 1.7.8.x y 8.x**.

Su objetivo es reutilizar los datos del pedido y la información logística necesaria para crear o actualizar el DeCA, mantener el documento asociado a la operación y reducir la introducción manual de datos.

## Flujo

```text
Pedido PrestaShop
   |
pedido + datos logísticos explícitos
   |
crear/actualizar expedición DeCA
   |
generar/reutilizar/revisar DeCA
   |
estado local + document ID
```

## Compatibilidad

- PrestaShop >= 1.7.8.0 y < 9.0.
- PHP 7.4+.
- cURL.
- libsodium u OpenSSL para cifrar la clave API.

PrestaShop 9 queda fuera del rango actual hasta que exista una necesidad real de producto y se valide específicamente.

## Instalación

1. Instala el ZIP desde el gestor de módulos de PrestaShop.
2. Abre la configuración de **DeCA Transporte**.
3. Guarda endpoint, clave API y datos básicos del cargador/origen.
4. Ejecuta **Probar conexión**.
5. Desde un pedido, completa los datos logísticos necesarios.
6. Genera o actualiza el DeCA del pedido.

## Configuración

La configuración es por tienda e incluye:

- endpoint HTTPS de DeCA Transporte;
- clave API de Cargo Connect;
- nombre legal, NIF/CIF y dirección del cargador contractual;
- origen de carga;
- transportista efectivo por defecto, si aplica;
- estados de pedido opcionales para procesamiento automático;
- timeout de petición.

La clave API se cifra localmente y no vuelve a mostrarse después de guardarla.

La automatización está desactivada por defecto. Sin estados configurados, el módulo funciona de forma manual.

## Datos de transporte del pedido

Desde el pedido se pueden guardar:

- fecha de transporte;
- matrícula tractora;
- matrícula de remolque opcional;
- nombre legal y NIF/CIF del transportista efectivo;
- peso total opcional en kg;
- autorización especial opcional.

El módulo no inventa fecha, matrícula, transportista ni peso. Si falta un dato obligatorio, la generación debe detenerse con un error útil.

## Peso

Si no existe un peso explícito, el módulo suma los pesos nativos de producto y convierte unidades habituales a kg. Si algún dato no permite calcular un peso fiable, no fabrica un valor.

## Revisiones e idempotencia

La primera generación crea la expedición y el DeCA. Las siguientes reutilizan la misma identidad de expedición y actualizan el documento solo cuando existen cambios materiales, conservando la trazabilidad de revisiones.

## Persistencia local

La tabla `pdeca_order_sync`, única por tienda + pedido, conserva únicamente el estado necesario del conector y los datos logísticos explícitos: identificadores de expedición/documento, estado/error, fecha, matrículas, transportista, peso, autorización y fecha de actualización.

La clave API no se guarda en esa tabla.

## Seguridad

- endpoint obligatorio por HTTPS;
- clave API cifrada localmente;
- no se instala ningún secreto interno de plataforma en PrestaShop;
- no se copia la URL pública del DeCA en mensajes del pedido.

## Comprobación de conexión

Después de guardar endpoint y clave API, usa **Probar conexión con DeCA Transporte**. Es una comprobación no destructiva que no crea ni modifica pedidos o expediciones.

## Criterio de producto

Este módulo pertenece a **Cargo Connect**. No depende de Atlas, DR, eCMR, OIDC ni de matrices de aceptación de arquitectura para considerarse entregable. Su criterio es: instalar, configurar, conectar un pedido, generar/actualizar el DeCA y dejar el documento identificado y trazable.

# DeCA Transporte para WooCommerce

Plugin instalable de **Cargo Connect** para WordPress/WooCommerce.

Su objetivo es simple: reutilizar los datos del pedido y la información logística necesaria para crear o actualizar el DeCA, mantener el documento asociado al pedido y evitar volver a introducir manualmente la misma información.

## Flujo

```text
Pedido WooCommerce
   |
mapear pedido + datos logísticos
   |
crear/actualizar expedición DeCA
   |
generar/reutilizar/revisar DeCA
   |
pedido: shipment ID + document ID + access URL
```

Si los datos relevantes no han cambiado, se reutiliza el DeCA vigente. Si cambian, se actualiza la expedición y se conserva la trazabilidad de la nueva revisión.

## Compatibilidad

- WooCommerce 8.2+.
- WordPress 6.5+.
- PHP 7.4+.
- Compatible con HPOS.
- Usa WooCommerce CRUD, no acceso directo a tablas de pedidos.
- Usa Action Scheduler cuando está disponible y WordPress cron como fallback.

## Instalación

1. Instala el ZIP del conector desde **Plugins > Añadir plugin > Subir plugin**.
2. Actívalo con WooCommerce activo.
3. Abre **WooCommerce > DeCA Transporte**.
4. Guarda la conexión y los datos básicos del cargador/origen.
5. Ejecuta **Probar conexión**.
6. Completa los datos logísticos del pedido y usa la acción **Generar / actualizar DeCA**.

## Configuración

En **WooCommerce > DeCA Transporte** se configuran:

- endpoint HTTPS de DeCA Transporte;
- clave API de Cargo Connect;
- nombre legal, NIF/CIF y dirección del cargador contractual;
- origen de carga por defecto;
- transportista por defecto si no llega informado en el pedido;
- campos de pedido para fecha de transporte, matrícula tractora, remolque opcional, autorización especial opcional y peso opcional;
- estados WooCommerce que pueden lanzar el proceso automáticamente.

Si no se selecciona ningún estado, el plugin funciona en modo manual.

## Datos logísticos

El conector **no inventa datos de cumplimiento**. Si falta fecha de transporte, transportista, matrícula, destino o cantidad/peso necesarios, la validación debe detener la generación con un error útil.

El peso puede venir de un campo configurado del pedido. Si no existe, el plugin suma los pesos de producto de WooCommerce y los convierte a kilogramos. Si no puede obtener un peso fiable, no fabrica uno.

## Documento y trazabilidad

El pedido conserva:

- identificador de expedición;
- identificador del documento DeCA;
- URL de acceso al documento.

La URL pública del documento no se copia en las notas del pedido; las notas utilizan únicamente el identificador documental.

## Seguridad

La clave API se cifra en reposo con libsodium cuando está disponible o AES-256-GCM mediante OpenSSL. No existe fallback en texto plano.

## Personalización

El payload final puede adaptarse antes de enviarlo:

```php
add_filter(
    'pdeca_woo_shipment_payload',
    function ( $payload, $order, $settings ) {
        return $payload;
    },
    10,
    3
);
```

Cualquier modificación sigue pasando por la validación DeCA.

## Comprobación de conexión

Después de guardar endpoint y clave API, usa **Probar conexión con DeCA Transporte**. La comprobación es no destructiva y no crea ni modifica expediciones.

## Criterio de producto

Este conector está dentro de **Cargo Connect**. No depende de Atlas, DR, eCMR, OIDC ni de gates de arquitectura para considerarse entregable. Su criterio es: instalar, configurar, conectar un pedido, generar/actualizar el DeCA y dejar el documento accesible y trazable.

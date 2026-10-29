# DeCA Transporte para WooCommerce

Plugin instalable de **Cargo Connect** para WordPress/WooCommerce.

Su objetivo es simple: reutilizar los datos del pedido y la información logística necesaria para crear o actualizar el DeCA, mantener el documento asociado al pedido y evitar volver a introducir manualmente la misma información.

## Flujo

```text
Pedido WooCommerce
   |
pedido + datos de transporte editables
   |
crear/actualizar expedición DeCA
   |
generar/reutilizar/revisar DeCA
   |
pedido: estado + shipment ID + document ID + acceso al documento
```

Si los datos relevantes no han cambiado, se reutiliza el DeCA vigente. Si cambian, se actualiza la expedición y se conserva la trazabilidad de la nueva revisión.

## Compatibilidad

- WooCommerce 8.2+.
- WordPress 6.5+.
- PHP 7.4+.
- Compatible con HPOS.
- Usa WooCommerce CRUD, no acceso directo a tablas de pedidos.
- Usa Action Scheduler cuando está disponible y WordPress cron como fallback.

## Instalación y primer DeCA

1. Instala el ZIP del conector desde **Plugins > Añadir plugin > Subir plugin**.
2. Actívalo con WooCommerce activo.
3. Abre **WooCommerce > DeCA Transporte**.
4. Guarda la clave de Cargo Connect y los datos básicos del cargador/origen.
5. Ejecuta **Probar conexión con DeCA Transporte**.
6. Abre un pedido.
7. En el bloque **DeCA Transporte**, completa fecha de transporte, matrícula y cualquier dato que no llegue ya del pedido o de la configuración general.
8. Guarda/actualiza el pedido.
9. Usa la acción **Generar / actualizar DeCA**.
10. Abre el documento desde el botón **Abrir documento DeCA** del mismo pedido.

## Configuración básica

En **WooCommerce > DeCA Transporte** se configuran primero:

- endpoint HTTPS de DeCA Transporte;
- clave API de Cargo Connect;
- nombre legal, NIF/CIF y dirección del cargador contractual;
- origen de carga por defecto;
- transportista por defecto, si aplica.

La propia pantalla indica si la configuración básica está completa.

## Opciones avanzadas

Quedan separadas del primer uso:

- nombres de los metadatos usados para integrar otros plugins/sistemas;
- estados WooCommerce que pueden lanzar el proceso automáticamente;
- timeout HTTP.

Si no se selecciona ningún estado, el plugin funciona en modo manual.

## Datos de transporte del pedido

El operador puede editar directamente desde el pedido:

- fecha de transporte;
- matrícula tractora;
- matrícula de remolque opcional;
- transportista efectivo y NIF/CIF;
- peso total opcional en kg;
- autorización especial opcional.

Los valores del pedido tienen prioridad sobre los valores generales. Si el transportista del pedido se deja vacío, se usa el transportista por defecto configurado. Si el peso se deja vacío, el conector intenta calcularlo con los pesos de producto de WooCommerce.

El conector **no inventa datos de cumplimiento**. Si falta un dato obligatorio, la validación debe detener la generación con un error útil.

## Documento y trazabilidad

El pedido muestra y conserva:

- estado DeCA;
- identificador de expedición;
- identificador del documento DeCA;
- enlace directo para abrir el documento;
- último error de generación, si existe.

La URL pública del documento no se copia en las notas del pedido.

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

## Criterio de producto

Este conector está dentro de **Cargo Connect**. Su recorrido mínimo es: instalar, configurar, probar conexión, completar los datos de transporte del pedido, generar/actualizar el DeCA y abrir el documento desde el propio pedido.

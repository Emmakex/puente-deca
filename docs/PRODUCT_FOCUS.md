# DeCA Transporte · foco de producto

Este documento fija el alcance operativo y comercial de DeCA para evitar volver a convertir el proyecto en un ejercicio de arquitectura.

## 1. Objetivo

El objetivo es vender y entregar **DeCA Transporte** como un producto simple, estable y útil para generar, conservar y consultar el Documento Electrónico de Control Administrativo (DeCA) a partir de datos reales de transporte.

La prioridad es siempre el producto que usa el cliente. Arquitectura, infraestructura, automatización, observabilidad, abstracciones y pruebas adicionales solo se desarrollan cuando protegen o desbloquean una necesidad real del producto.

## 2. Superficie comercial canónica

La autoridad comercial es:

- `https://kairoseth.com/products/kairoseth-cargo`
- `/products/puente-deca` es únicamente una ruta histórica que redirige a la landing canónica.

Nombre comercial:

- ES: **DeCA Transporte**
- EN: **DeCA Transport Software**

El repositorio `puente-deca` es la implementación técnica. El nombre interno histórico `Puente DeCA` puede mantenerse en slugs, clases, opciones, tablas, text domains o identificadores cuando cambiarlo pueda romper compatibilidad, pero no debe dominar la experiencia comercial ni la interfaz del cliente.

## 3. Oferta comercial vigente

### Cargo Web — 19 €/mes

- 150 DeCA al mes.
- 3 usuarios.
- 1 organización.
- Creación manual.
- Excel / CSV.
- PDF + QR + acceso al documento.
- Histórico y versiones.

### Cargo Connect — 49 €/mes

- 1.000 DeCA al mes.
- 10 usuarios.
- 1 organización.
- Hasta 2 conexiones ecommerce.
- Todo Cargo Web.
- WooCommerce.
- PrestaShop.

### Cargo API — 99 €/mes

- 5.000 DeCA al mes.
- 25 usuarios.
- 1 organización.
- Hasta 2 conexiones ecommerce.
- Hasta 10 credenciales API.
- Todo Cargo Connect.
- ERP / TMS.
- CRM.
- Software propio e integraciones personalizadas.

Servicios comerciales complementarios:

- configuración estándar de conector: 149 €;
- integración API/ERP personalizada: desde 490 €;
- prueba comercial: 14 días, 25 DeCA, sin tarjeta.

Los precios y límites se gobiernan desde `kairoseth-platform/src/lib/kairoseth-cargo-commercial-policy.ts`. Este documento describe el contrato vigente, pero la política de Kairoseth Platform es la autoridad para valores comerciales.

## 4. Correspondencia producto ↔ técnica

| Oferta | Implementación principal |
| --- | --- |
| Cargo Web | `connectors/file-import`, núcleo DeCA, documento e histórico |
| Cargo Connect | `connectors/woocommerce` y `connectors/prestashop` |
| Cargo API | `apps/api` + integraciones a medida reutilizando el núcleo DeCA |

Todo desarrollo nuevo debe poder explicar a qué oferta o necesidad real pertenece. Si no existe una respuesta clara, se pospone.

## 5. Flujo esencial

```text
Pedido / Excel / API / datos de transporte
                 |
                 v
             Datos DeCA
                 |
                 v
             Validación
                 |
                 v
          Documento PDF/QR
                 |
                 v
        Consulta + histórico
```

Este recorrido es el corazón del producto.

## 6. Alcance activo

Se mantienen y desarrollan:

- plugin instalable WordPress/WooCommerce;
- módulo instalable PrestaShop;
- importación Excel/CSV;
- normalización y validación DeCA;
- generación de documento PDF/QR;
- persistencia e histórico necesarios;
- API únicamente cuando sirve a Cargo API o a los conectores actuales;
- documentación corta de instalación y uso;
- tests proporcionales al flujo esencial;
- experiencia de configuración comprensible para un cliente.

## 7. Fuera del foco actual

No son objetivos de producto ni bloqueantes mientras no exista una necesidad real:

- eCMR / eFTI;
- Atlas/GridFS como proyecto en sí mismo;
- OIDC o capas de identidad creadas solo para demostrar arquitectura;
- disaster-recovery drills sin riesgo actual que los justifique;
- evidence gates y matrices de aceptación complejas;
- infraestructura paralela a la ya disponible;
- escalabilidad hipotética;
- abstracciones para integraciones todavía inexistentes;
- observabilidad avanzada sin problema operativo real.

Si alguna de estas capacidades vuelve a ser necesaria por cliente, seguridad, legalidad o producción, se recupera desde Git y se implementa con el alcance mínimo necesario.

## 8. Definition of Done

Una versión de DeCA Transporte está terminada cuando:

1. El cliente puede instalar o acceder al producto correspondiente a su plan.
2. La configuración necesaria se entiende sin conocimiento interno de Kairoseth.
3. Puede introducir o reutilizar los datos de transporte.
4. Puede generar un DeCA válido o recibir un error útil indicando qué dato falta.
5. Puede consultar/descargar el documento generado.
6. El documento queda asociado al pedido/expedición y existe trazabilidad suficiente de sus revisiones.
7. El flujo esencial está cubierto por tests proporcionales.
8. La documentación de instalación/configuración está actualizada.
9. Kairoseth.com describe exactamente lo que el producto puede entregar.

No hace falta completar arquitectura futura para cumplir esta definición.

## 9. Regla de decisión diaria

Antes de abrir cualquier tarea, responder:

> ¿Esto hace que DeCA Transporte sea más usable, vendible, estable, entregable o necesario para un cliente real ahora?

- **Sí** → entra en el trabajo activo.
- **No** → backlog, no bloquea.

## 10. Orden de trabajo actual

1. WooCommerce: instalación, configuración y generación desde pedido con UX clara.
2. PrestaShop: mismo recorrido esencial y misma claridad comercial.
3. Verificar que los dos ZIP se construyen y contienen solo lo necesario.
4. Revisar consulta/descarga e histórico desde cada ecommerce.
5. Dejar guía corta de instalación y primer DeCA.
6. Alinear textos, nombres y CTA con Kairoseth.com.
7. Detener desarrollo general y responder después a uso real de clientes.

## 11. Regla de compatibilidad

La limpieza comercial no debe romper instalaciones existentes por cambios cosméticos. Se preservan identificadores técnicos históricos cuando formen parte de contratos persistidos o integraciones existentes. Se cambia primero la experiencia visible del cliente.

## 12. Regla global Kairoseth

Este proyecto se rige por la regla global **Product-First Engineering** de Kairoseth:

> **Producto primero. Estabilizar lo que el usuario necesita. Entregarlo. Arquitectar el resto cuando la realidad lo requiera.**

# DeCA Transporte

Repositorio de producto para generar y conservar el **Documento Electrónico de Control Administrativo (DeCA)** con el menor número posible de piezas.

> **Regla del proyecto:** producto primero. El contrato de alcance, oferta comercial, Definition of Done y orden de trabajo está fijado en [`docs/PRODUCT_FOCUS.md`](docs/PRODUCT_FOCUS.md). Si una tarea no mejora el producto actual o responde a una necesidad real, no bloquea y se pospone.

## Producto activo

DeCA se entrega de tres formas alineadas con `kairoseth.com`:

1. **Cargo Web** — creación manual + Excel/CSV.
2. **Cargo Connect** — conectores instalables para WordPress/WooCommerce y PrestaShop.
3. **Cargo API** — ERP, TMS, CRM, software propio e integraciones personalizadas reutilizando el núcleo DeCA cuando aporta valor.

La superficie comercial canónica es `https://kairoseth.com/products/kairoseth-cargo`. Este repositorio contiene la implementación técnica reutilizable.

## Flujo que importa

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

Todo trabajo debe proteger o mejorar este recorrido. La arquitectura que no sea necesaria para hacerlo funcionar de forma usable y estable se pospone.

## Componentes activos

- `connectors/woocommerce` — plugin WordPress/WooCommerce para Cargo Connect.
- `connectors/prestashop` — módulo PrestaShop para Cargo Connect.
- `connectors/file-import` — Excel/CSV y base reutilizable para Cargo Web/integraciones.
- `packages/contracts` — contrato DeCA compartido.
- `packages/core` — normalización y validación DeCA.
- `packages/document-engine` — PDF, QR y snapshot documental.
- `packages/persistence` — persistencia necesaria para documento e histórico.
- `apps/api` — servicio reutilizable para Cargo API y conectores cuando lo necesiten.

## Paquetes instalables

Versión actual de conectores: **0.1.1**.

```bash
npm ci
npm run release:connectors
```

Genera:

- `dist/puente-deca-woocommerce-0.1.1.zip`
- `dist/puentedeca-prestashop-0.1.1.zip`
- `dist/SHA256SUMS`

Los nombres de archivo e identificadores internos históricos se conservan por compatibilidad. La experiencia visible del cliente utiliza **DeCA Transporte**.

En WooCommerce y PrestaShop el operador puede consultar desde el pedido el estado actual del DeCA y abrir el documento generado cuando existe.

## Validación de producto

La comprobación normal del repositorio es deliberadamente pequeña:

```bash
npm run check
npm test
npm run release:connectors
```

Se valida el núcleo DeCA, el documento, los conectores, el empaquetado y los flujos esenciales. Pruebas de infraestructura, DR, Atlas, evidencia de aceptación, OIDC o similares no forman parte del criterio normal de entrega.

## Fuera del alcance activo

No son bloqueantes para el producto actual:

- eCMR / eFTI;
- Atlas/GridFS como ejercicio independiente;
- DR/restore drills sin una necesidad real;
- infraestructura de evidence gates;
- OIDC/edge creado únicamente para demostrar arquitectura;
- escalabilidad, observabilidad o hardening adicional sin requisito real de cliente, seguridad o producción.

Git conserva el historial si alguna capacidad vuelve a ser necesaria.

## Definition of Done

La versión actual se considera viable cuando:

- el ZIP de WooCommerce se puede construir e instalar;
- el ZIP de PrestaShop se puede construir e instalar;
- ambos completan el flujo esencial DeCA con una configuración comprensible;
- los datos que faltan producen errores útiles en lugar de datos inventados;
- el documento queda disponible para consulta/descarga y asociado a la expedición/pedido;
- el histórico o trazabilidad de revisiones se conserva;
- existe documentación corta de instalación/configuración y primer DeCA;
- los tests proporcionales al flujo anterior están verdes;
- `kairoseth.com` vende exactamente lo que el producto entrega.

Después de ese punto, cualquier arquitectura o integración adicional se desarrolla por necesidad real de cliente o producción, no por anticipación.

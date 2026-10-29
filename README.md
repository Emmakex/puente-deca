# DeCA Transporte

Repositorio de producto para generar y conservar el **Documento de Control Administrativo (DeCA)** con el menor número posible de piezas.

## Producto activo

DeCA se entrega de tres formas:

1. **WordPress / WooCommerce** — plugin instalable para configurar la integración y generar el DeCA desde un pedido.
2. **PrestaShop** — módulo instalable con el mismo flujo esencial.
3. **Integración a medida** — ERP, CRM, software propio, CSV/Excel u otros sistemas reutilizando el núcleo DeCA cuando aporte valor.

Kairoseth.com es la superficie comercial. Este repositorio contiene el producto técnico reutilizable.

## Flujo que importa

```text
Pedido / datos de transporte
          |
          v
     Datos DeCA
          |
          v
      Validación
          |
          v
      Documento
          |
          v
       Histórico
```

Todo trabajo debe proteger o mejorar este recorrido. La arquitectura que no sea necesaria para hacerlo funcionar de forma usable y estable se pospone.

## Componentes que mantenemos activos

- `connectors/woocommerce` — plugin WordPress/WooCommerce.
- `connectors/prestashop` — módulo PrestaShop.
- `connectors/file-import` — base reutilizable para CSV/Excel e integraciones a medida.
- `packages/contracts` — contrato DeCA compartido.
- `packages/core` — normalización y validación DeCA.
- `packages/document-engine` — generación de PDF, QR y snapshot documental.
- `packages/persistence` — persistencia necesaria para documento e histórico.
- `apps/api` — servicio reutilizable cuando una instalación/integración lo necesite.

## Paquetes instalables

```bash
npm ci
npm run release:connectors
```

Genera:

- `dist/puente-deca-woocommerce-0.1.0.zip`
- `dist/puentedeca-prestashop-0.1.0.zip`
- `dist/SHA256SUMS`

El empaquetado es reproducible y valida que ambos ZIP contienen únicamente los archivos necesarios para instalar cada conector.

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
- Atlas/GridFS como ejercicio de aceptación independiente;
- DR/restore drills sin una necesidad real;
- infraestructura de evidencia y promoción de gates;
- aceptación OIDC/edge creada únicamente para demostrar arquitectura;
- hardening adicional sin requisito real de cliente, seguridad o producción.

El código histórico puede conservarse temporalmente mientras se completa la limpieza, pero no gobierna el roadmap ni el CI del producto. Git mantiene el historial si en el futuro alguna capacidad vuelve a ser necesaria.

## Definition of Done

La versión actual se considera viable cuando:

- el ZIP de WooCommerce se puede construir e instalar;
- el ZIP de PrestaShop se puede construir e instalar;
- ambos pueden completar el flujo esencial DeCA con datos sintéticos;
- el documento queda disponible para consulta/descarga y su histórico se conserva;
- existe documentación corta de instalación/configuración;
- los tests proporcionales al flujo anterior están verdes.

Después de ese punto, cualquier arquitectura o integración adicional se desarrolla por necesidad real de cliente o producción, no por anticipación.

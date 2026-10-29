# DeCA Transporte · criterio de primer uso

Este documento fija el recorrido mínimo que debe poder completar un cliente nuevo sin conocer la arquitectura interna de Kairoseth.

## WooCommerce / PrestaShop

El primer uso debe poder entenderse como:

1. Instalar el conector.
2. Introducir credencial y datos básicos de empresa/origen.
3. Probar la conexión.
4. Abrir un pedido.
5. Completar únicamente los datos de transporte que falten.
6. Generar o refrescar el DeCA.
7. Abrir el documento desde el propio pedido.

## Regla de interfaz

La configuración inicial debe mostrar primero lo necesario para empezar. Campos técnicos, mapeos, automatización y timeouts pertenecen a opciones avanzadas y no deben competir visualmente con el primer uso.

La interfaz debe indicar claramente si la configuración básica está completa y qué falta cuando no lo está.

## Regla comercial

Los conectores WooCommerce y PrestaShop forman parte de **Cargo Connect** y deben usar la identidad visible **DeCA Transporte**. La landing comercial canónica es:

`https://kairoseth.com/products/kairoseth-cargo`

La interfaz puede enlazar a esa landing para planes o contratación, pero no debe introducir una segunda identidad comercial.

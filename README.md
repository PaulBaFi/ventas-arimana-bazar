# Sistema de Gestión de Ventas · Arimana Bazar

Aplicación académica construida con Astro, React, TypeScript y Tailwind CSS.

## Entorno de validación

La aplicación utiliza registros sintéticos almacenados localmente en IndexedDB para representar operaciones comerciales de Arimana Bazar. Incluye una semilla coherente de aproximadamente 80 clientes, 100 productos, 12 vendedores, 4 sucursales y 250 ventas con comprobantes, ubicaciones y medios de pago. No consulta bases transaccionales, Data Warehouse ni servicios externos. El módulo ETL trabaja con una Mock API local y las fuentes `siga_1646`, `SamarImportadora`, `DW_SamarImportadora`, `CASTILLONV2`, `BD_CASTILLON_VETERINARIA` y `ARIMANA_OLTP`; sus conexiones, credenciales e indicadores de carga no representan servicios reales. Las contraseñas nunca se persisten.

La persistencia usa el esquema local `arimana-bazar-demo` por compatibilidad interna. Este nombre técnico no representa un servicio remoto ni una base de datos real.

## Datos y migración

Los registros son sintéticos y están destinados a pruebas académicas, capturas profesionales y validación funcional. La semilla se genera de forma determinista con nombres, precios, fechas y relaciones comerciales plausibles. Al abrir una instalación anterior, la migración de IndexedDB actualiza únicamente los registros identificables de la semilla antigua, agrega la nueva información de referencia cuando corresponde y conserva los registros creados por el usuario, las ventas históricas y la auditoría. El consolidado no se rellena manualmente: debe generarse mediante el flujo ETL local.

## Comandos

- `pnpm dev`: inicia el servidor de desarrollo.
- `pnpm check`: ejecuta el verificador de Astro.
- `pnpm typecheck`: verifica los tipos TypeScript.
- `pnpm test`: ejecuta las pruebas unitarias con Vitest y fake-indexeddb.
- `pnpm run build`: compila las rutas estáticas.

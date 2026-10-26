# Sistema de Gestión de Ventas · Arimana Bazar

Aplicación académica construida con Astro, React, TypeScript y Tailwind CSS.

## Entorno de validación

La aplicación utiliza registros sintéticos almacenados localmente en IndexedDB. No consulta bases transaccionales, Data Warehouse ni servicios externos. Las credenciales y resultados de los procesos disponibles en etapas posteriores son exclusivos del entorno local; no deben utilizarse como datos operativos ni como evidencia de procesos reales.

La persistencia usa el esquema local `arimana-bazar-demo` por compatibilidad interna. Este nombre técnico no representa un servicio remoto ni una base de datos real.

## Comandos

- `pnpm dev`: inicia el servidor de desarrollo.
- `pnpm check`: ejecuta el verificador de Astro.
- `pnpm typecheck`: verifica los tipos TypeScript.
- `pnpm test`: ejecuta las pruebas unitarias con Vitest y fake-indexeddb.
- `pnpm run build`: compila las rutas estáticas.

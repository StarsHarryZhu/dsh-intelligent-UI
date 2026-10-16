# dsh-intelligent-ui

Tarjetas interactivas en los chats de DeepSeek Harness. El modelo escribe un pequeño programa de interfaz; el chat lo dibuja como una tarjeta nativa —deslizadores, campos, selectores, métricas, tablas, gráficos, barras de progreso y botones de respuesta— y cada control recalcula en tu navegador sin otra llamada al modelo.

[English](README.md) · [中文](README-zh.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

## Qué hace

- Registra una herramienta, `ui_render`. El modelo envía un programa en `source`; el plugin lo valida contra un catálogo fijo de componentes y guarda el programa compilado con el resultado de la herramienta.
- Dibuja la tarjeta en la fila de la herramienta mientras se escribe la respuesta (con vista previa mientras llega el programa) y debajo de la respuesta cuando el turno termina.
- Recalcula todo localmente al mover un control. No se envía nada hasta que pulsas un botón, que envía su texto como tu siguiente mensaje.
- Usa el tema, las fuentes y el idioma del anfitrión, en modo claro y oscuro.
- Nunca ejecuta código escrito por el modelo: el programa son datos.

## Instalación

Instala el paquete en un perfil con el Plugin Manager (Ajustes → Plugins → instalar desde una carpeta local) o desde un agente con `plugin_manager` `install_bundle`. Reinicia el harness tras instalar o recompilar y recarga la página.

## Desinstalación

Desactiva o elimina el bundle en Ajustes → Plugins. Las sesiones siguen abriéndose; las llamadas anteriores se muestran como filas de herramienta normales. El plugin no añade tipos de evento de sesión.

## Desarrollo

```sh
node scripts/link-dev.mjs
node build.js
node node_modules/vitest/vitest.mjs run
```

## Licencia

[MIT License](LICENSE) © 2026 Starfield.

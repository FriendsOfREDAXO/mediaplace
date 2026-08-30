/**
 * Einstiegspunkt fuer den esbuild-Bundle (siehe build.js/DEV.md).
 * core.js ist der Hub: importiert alle modules/*.js und verdrahtet sie ueber
 * ctx-Objekte, enthaelt daneben noch nicht extrahierten Code (Data-Loading,
 * build()/open()/close(), Event-Delegation).
 */
import './core.js';

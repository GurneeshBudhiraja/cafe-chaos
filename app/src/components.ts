/**
 * Component manifest shared by the app runtime and the scene editor.
 * Every app component that scenes may author must be listed here.
 */

import { defineComponents } from '@iwsdk/core';
import { DesktopBackdrop, TabletHandle, WritingSurface } from './note-components.js';

export default defineComponents([WritingSurface, TabletHandle, DesktopBackdrop]);

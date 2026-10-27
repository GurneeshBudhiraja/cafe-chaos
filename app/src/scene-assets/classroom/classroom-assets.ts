/**
 * The classroom backdrop: a room shell and its furniture, for the flat
 * desktop view and demo recordings only. In the headset the user sees their
 * real room through passthrough, so a placed backdrop entity must carry
 * `DesktopBackdrop` (src/note-components.ts), which hides it in XR.
 *
 * Nothing places it in the scene today. Everything it needs lives in this
 * folder; to drop it, delete the folder and its import and spread in
 * src/assets.ts.
 */

import { studentChairPrototype, studentDeskPrototype, teacherDeskPrototype } from './furniture.scene-asset.js';
import { classroomRoomPrototype } from './room.scene-asset.js';

/** Manifest entries, spread into the app's asset manifest. */
export const classroomAssets = {
  'classroom-room': classroomRoomPrototype,
  'student-desk': studentDeskPrototype,
  'student-chair': studentChairPrototype,
  'teacher-desk': teacherDeskPrototype,
};

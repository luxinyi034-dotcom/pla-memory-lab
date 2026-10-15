import { todayView } from './today.js';
import { newView, reviewView } from './learn.js';
import { studyView } from './study.js';
import { libraryView } from './library.js';
import { detailView, editView, addView, practiceView } from './expression.js';
import { planView } from './plan.js';
import { quickHubView, quickRunView, wrongDictationView } from './quick.js';
import { favoritesView, checkinView, settingsView } from './misc.js';

// Route name (first hash segment) → view.
export const views = {
  today: todayView,
  new: newView,
  review: reviewView,
  study: studyView,
  library: libraryView,
  detail: detailView,
  edit: editView,
  add: addView,
  practice: practiceView,
  plan: planView,
  quick: quickHubView,
  'quick-run': quickRunView,
  'wrong-dictation': wrongDictationView,
  favorites: favoritesView,
  checkin: checkinView,
  settings: settingsView,
};

import type { ScenarioDefinition } from '../harness/types.js';
import { animationsScenario } from './animations.js';
import { drawEditScenario } from './drawEdit.js';
import { earthScenario } from './earth.js';
import { elementsScenario } from './elements.js';
import { eventsMenuScenario } from './eventsMenu.js';
import { layersScenario } from './layers.js';
import { measureScenario } from './measure.js';
import { overlaysScenario } from './overlays.js';
import { stylesShapesScenario } from './stylesShapes.js';
import { transformScenario } from './transform.js';
import { utilitiesScenario } from './utilities.js';
import { viewControlsScenario } from './viewControls.js';

export const scenarios = Object.freeze([
  earthScenario,
  viewControlsScenario,
  layersScenario,
  elementsScenario,
  stylesShapesScenario,
  drawEditScenario,
  measureScenario,
  transformScenario,
  animationsScenario,
  eventsMenuScenario,
  overlaysScenario,
  utilitiesScenario
] satisfies readonly ScenarioDefinition[]);

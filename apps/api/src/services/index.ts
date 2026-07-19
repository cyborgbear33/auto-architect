import type { LogosBridge } from "@auto/logos-bridge";
import type { Store } from "../store/index.ts";
import { VehicleService } from "./vehicle.ts";
import { ForecastService } from "./forecast.ts";
import { RecognitionService } from "./recognition.ts";
import { PolicyService } from "./policy.ts";
import { SolverService } from "./solver.ts";
import { ActionService } from "./actions.ts";
import { ObservationService } from "./observations.ts";
import { RecommendationService } from "./recommendations.ts";
import { CampaignService } from "./campaigns.ts";

export interface Services {
  store: Store;
  bridge: LogosBridge;
  vehicles: VehicleService;
  forecast: ForecastService;
  recognition: RecognitionService;
  policy: PolicyService;
  solver: SolverService;
  actions: ActionService;
  observations: ObservationService;
  recommendations: RecommendationService;
  campaigns: CampaignService;
}

export function createServices(store: Store, bridge: LogosBridge): Services {
  const vehicles = new VehicleService(store);
  const forecast = new ForecastService(store, bridge);
  const recognition = new RecognitionService(store, bridge, vehicles, forecast);
  const policy = new PolicyService(bridge);
  const solver = new SolverService(bridge);
  const actions = new ActionService(store, vehicles, recognition, policy, solver);
  const observations = new ObservationService(store, vehicles);
  const recommendations = new RecommendationService(store, vehicles, recognition);
  const campaigns = new CampaignService(vehicles);

  return { store, bridge, vehicles, forecast, recognition, policy, solver, actions, observations, recommendations, campaigns };
}

export {
  VehicleService,
  ForecastService,
  RecognitionService,
  PolicyService,
  SolverService,
  ActionService,
  ObservationService,
  RecommendationService,
  CampaignService,
};

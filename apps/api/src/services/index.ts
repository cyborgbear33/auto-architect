import type { LogosBridge } from "@auto/logos-bridge";
import type { Store } from "../store/index.ts";
import { ActionService } from "./actions.ts";
import { CampaignService } from "./campaigns.ts";
import { CaseTimelineService } from "./case-timeline.ts";
import { DiscoveryService } from "./discovery.ts";
import { DriveSessionService } from "./drive-sessions.ts";
import { ForecastService } from "./forecast.ts";
import { GarageExportService } from "./garage-export.ts";
import { ObservationService } from "./observations.ts";
import { PolicyService } from "./policy.ts";
import { RecognitionService } from "./recognition.ts";
import { RecommendationService } from "./recommendations.ts";
import { ReportService } from "./report.ts";
import { SolutionHistoryService } from "./solution-history.ts";
import { SolverService } from "./solver.ts";
import { SpecialProcedureService } from "./special-procedures.ts";
import { VehicleService } from "./vehicle.ts";

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
  discovery: DiscoveryService;
  driveSessions: DriveSessionService;
  recommendations: RecommendationService;
  campaigns: CampaignService;
  specialProcedures: SpecialProcedureService;
  solutionHistory: SolutionHistoryService;
  caseTimeline: CaseTimelineService;
  garageExport: GarageExportService;
  reports: ReportService;
}

export function createServices(store: Store, bridge: LogosBridge): Services {
  const vehicles = new VehicleService(store);
  const forecast = new ForecastService(store, bridge);
  const recognition = new RecognitionService(store, bridge, vehicles, forecast);
  const policy = new PolicyService(bridge);
  const solver = new SolverService(bridge);
  const solutionHistory = new SolutionHistoryService(store, vehicles);
  const caseTimeline = new CaseTimelineService(store, vehicles);
  const garageExport = new GarageExportService(store, vehicles, caseTimeline);
  const actions = new ActionService(store, vehicles, recognition, policy, solver, solutionHistory);
  const observations = new ObservationService(store, vehicles);
  const discovery = new DiscoveryService(store, vehicles);
  const driveSessions = new DriveSessionService(store, vehicles, observations);
  const campaigns = new CampaignService(vehicles);
  const specialProcedures = new SpecialProcedureService(vehicles);
  const recommendations = new RecommendationService(
    store,
    vehicles,
    recognition,
    solutionHistory,
    actions,
    campaigns,
  );
  const reports = new ReportService(
    vehicles,
    observations,
    recognition,
    recommendations,
    actions,
    campaigns,
    driveSessions,
  );

  return {
    store,
    bridge,
    vehicles,
    forecast,
    recognition,
    policy,
    solver,
    actions,
    observations,
    discovery,
    driveSessions,
    recommendations,
    campaigns,
    specialProcedures,
    solutionHistory,
    caseTimeline,
    garageExport,
    reports,
  };
}

export {
  ActionService,
  CampaignService,
  CaseTimelineService,
  DiscoveryService,
  DriveSessionService,
  ForecastService,
  GarageExportService,
  ObservationService,
  PolicyService,
  RecognitionService,
  RecommendationService,
  ReportService,
  SolutionHistoryService,
  SolverService,
  SpecialProcedureService,
  VehicleService,
};

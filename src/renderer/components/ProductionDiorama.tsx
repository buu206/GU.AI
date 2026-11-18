import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import type {
  GuCrewMember,
  GuPackId,
  GuSceneId,
  GuStageMode,
  PipelineStage,
  ProjectStatus,
} from '../../shared/contracts';
import { GU_SCENE_IMAGES } from '../guSceneAssets';
import { CYBER_SCENES } from '../cyberArtAssets';
import type { GuSpriteManifest } from '../guAnimation';
import { guProductionPack } from '../guProductionPacks';
import {
  WALK_ACTION,
  productionAssistantScene,
  productionCrewActionDelay,
  productionCrewMembers,
  selectProductionAssistantBeat,
  selectProductionCrewRoamPoint,
  shouldProductionAssistantRoam,
  type ProductionCrewMember,
  type ProductionCrewRole,
  type ProductionCrewSize,
} from '../productionAssistantState';
import {
  advanceProductionAssistantRoute,
  createProductionAssistantMotion,
  routeProductionAssistant,
  settleProductionAssistantAt,
  type ProductionAssistantMotionState,
} from '../productionAssistantMotion';
import { productionDepthZ } from '../productionMapNavigation';
import { GuAnimatedSprite } from './GuAnimatedSprite';

interface ProductionDioramaProps {
  stage: PipelineStage;
  status: ProjectStatus;
  stageMode?: GuStageMode;
  sceneId?: GuSceneId;
  soloSceneId?: GuPackId;
  packId?: GuPackId;
  spriteManifest?: GuSpriteManifest;
  crewSize?: ProductionCrewSize;
  crew?: readonly GuCrewMember[];
}

export function ProductionDiorama({
  stage,
  status,
  stageMode = 'solo',
  sceneId = 'collaboration',
  soloSceneId = 'classic',
  packId = 'classic',
  spriteManifest,
  crewSize = 4,
  crew: configuredCrew,
}: ProductionDioramaProps) {
  const productionPack = guProductionPack(packId);
  const soloScenePack = guProductionPack(soloSceneId);
  const activeSpriteManifest = spriteManifest ?? productionPack.spriteManifest;
  const scene = useMemo(() => productionAssistantScene(stage, status), [stage, status]);
  const collaborativeRuntime = stageMode === 'crew';
  const runtimeConfiguredCrew = collaborativeRuntime ? configuredCrew : undefined;
  const runtimeCrewSize: ProductionCrewSize = collaborativeRuntime ? crewSize : 1;
  const crew = useMemo(
    () => configuredProductionCrewMembers(stage, status, runtimeConfiguredCrew, runtimeCrewSize),
    [runtimeConfiguredCrew, runtimeCrewSize, stage, status],
  );
  const activeMember = crew.find((member) => member.active) ?? crew[0]!;
  // Keep saved scene IDs compatible while every scene uses the new GAME//OS art.
  const rooftopScene = collaborativeRuntime && sceneId === 'fishing';
  const sceneImage = !collaborativeRuntime
    ? soloScenePack.sceneImage
    : rooftopScene ? CYBER_SCENES.fishing : GU_SCENE_IMAGES.collaboration;
  const orderedCrew = useMemo(() => [
    ...crew.filter((member) => member.active),
    ...crew.filter((member) => !member.active),
  ], [crew]);
  const reducedMotion = useReducedMotion();
  const documentVisible = useDocumentVisible();
  const [actorSnapshots, setActorSnapshots] = useState<Partial<
    Record<ProductionCrewRole, ProductionAssistantMotionState>
  >>({});
  const handleActorChange = useCallback((
    role: ProductionCrewRole,
    actor: ProductionAssistantMotionState,
  ) => {
    setActorSnapshots((current) => (
      current[role] === actor ? current : { ...current, [role]: actor }
    ));
  }, []);
  const activeActor = actorSnapshots[activeMember.role] ?? initialCrewActor(activeMember);
  const visibleEgg = activeActor.easterEgg;
  const statusLabel = status === 'running'
    ? 'GAME//OS WORKING'
    : status === 'completed'
      ? 'READY TO PLAY'
      : status === 'waiting'
        ? 'WAITING FOR YOU'
        : status === 'draft'
          ? 'DRAFT READY'
          : status === 'stopped'
            ? 'PAUSED'
            : 'NEEDS A HAND';

  return (
    <section
      className={`production-diorama status-${status}`}
      data-stage={scene.stage}
      data-gu-pack={packId}
      data-stage-mode={stageMode}
      data-runtime-scene={collaborativeRuntime ? sceneId : soloSceneId}
      data-station={activeMember.station}
      data-pipeline-station={scene.station}
      data-action={activeActor.action.id}
      data-easter-egg={visibleEgg?.id ?? 'none'}
      data-actor-node={activeActor.nodeId}
      data-actor-target={activeActor.targetNodeId ?? 'none'}
      data-route-remaining={activeActor.remainingRoute.length}
      data-active-crew-role={activeMember.role}
      data-crew-size={crew.length}
      data-crew-packs={runtimeConfiguredCrew?.map((member) => `${member.role}:${member.packId}`).join(',') ?? packId}
      data-scene-mode={rooftopScene ? 'fishing' : collaborativeRuntime ? 'collaboration' : 'solo'}
      aria-label={collaborativeRuntime ? '赛博朋克像素协作制作台' : '赛博朋克像素制作台'}
    >
      <div className="workshop-map" aria-hidden="true">
        <img src={sceneImage} alt="" draggable={false} />
      </div>
      <div className="workshop-pixel-lights" aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className="diorama-narration" role="status" aria-live="polite" aria-atomic="true">
        <span><i /> {statusLabel}</span>
        <strong>{scene.headline}</strong>
        <p>{activeMember.roleLabel} · {activeMember.stationLabel} · {scene.detail}</p>
      </div>

      {orderedCrew.map((member) => {
        const configuredMember = runtimeConfiguredCrew?.find((item) => item.role === member.role);
        const memberPackId = configuredMember?.packId ?? packId;
        return (
          <ProductionCrewActor
            key={`${member.id}:${memberPackId}`}
            member={member}
            packId={memberPackId}
            status={status}
            manifest={configuredMember
              ? guProductionPack(configuredMember.packId).spriteManifest
              : activeSpriteManifest}
            documentVisible={documentVisible}
            reducedMotion={reducedMotion}
            onActorChange={handleActorChange}
          />
        );
      })}

      <div className="diorama-action" aria-hidden="true">
        <span className={`diorama-action-led ${activeActor.phase === 'walking' ? 'is-moving' : ''}`} />
        <b>
          {activeMember.roleLabel} · {activeActor.phase === 'walking'
            ? WALK_ACTION.label
            : activeActor.action.label}
        </b>
        {visibleEgg ? <em>{visibleEgg.label}</em> : null}
      </div>

    </section>
  );
}

interface ProductionCrewActorProps {
  member: ProductionCrewMember;
  packId: GuPackId;
  status: ProjectStatus;
  manifest: GuSpriteManifest;
  documentVisible: boolean;
  reducedMotion: boolean;
  onActorChange: (role: ProductionCrewRole, actor: ProductionAssistantMotionState) => void;
}

function ProductionCrewActor({
  member,
  packId,
  status,
  manifest,
  documentVisible,
  reducedMotion,
  onActorChange,
}: ProductionCrewActorProps) {
  const [actor, setActor] = useState<ProductionAssistantMotionState>(
    () => initialCrewActor(member),
  );
  const actionsKey = member.actions.map((item) => item.id).join(':');

  useEffect(() => {
    setActor((current) => {
      const firstAction = member.actions[0]!;
      return reducedMotion
        ? settleProductionAssistantAt(current, member.nodeId, firstAction)
        : routeProductionAssistant(current, member.nodeId, firstAction);
    });
  }, [actionsKey, member.actions, member.nodeId, member.station, reducedMotion]);

  useEffect(() => {
    onActorChange(member.role, actor);
  }, [actor, member.role, onActorChange]);

  useEffect(() => {
    if (reducedMotion || !documentVisible) return undefined;
    const delay = actor.phase === 'walking'
      ? actor.segmentMs
      : productionCrewActionDelay(member);
    const timer = window.setTimeout(() => {
      setActor((current) => {
        if (current.phase === 'walking') return advanceProductionAssistantRoute(current);

        const selectedBeat = selectProductionAssistantBeat(member.actions, current.action.id);
        const beat = status === 'running' && member.active
          ? selectedBeat
          : { ...selectedBeat, easterEgg: null };
        const canRoam = shouldProductionAssistantRoam(
          status,
          beat.action,
          beat.easterEgg,
        );
        if (!canRoam) {
          return {
            ...current,
            action: beat.action,
            pendingAction: beat.action,
            easterEgg: beat.easterEgg,
            pendingEasterEgg: beat.easterEgg,
          };
        }

        const destination = selectProductionCrewRoamPoint(
          member,
          current.x,
          current.y,
        );
        const moonwalking = beat.easterEgg?.id === 'moonwalk';
        return routeProductionAssistant(current, destination.nodeId, beat.action, {
          easterEgg: beat.easterEgg,
          hideEasterEggOnArrival: moonwalking,
        });
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    actor.action.id,
    actor.phase,
    actor.segmentMs,
    actionsKey,
    documentVisible,
    member,
    reducedMotion,
    status,
  ]);

  const visibleEgg = actor.easterEgg;
  const renderedPose = visibleEgg?.id === 'debug-dance'
    ? 'celebrate'
    : actor.action.pose;
  const shadowProfile = guGroundShadowProfile(renderedPose, actor.phase);

  return (
    <div
      className={`production-assistant production-crew-member phase-${actor.phase}${member.active ? ' is-primary' : ' is-support'}${visibleEgg ? ` egg-${visibleEgg.id}` : ''}`}
      data-crew-role={member.role}
      data-gu-member-pack={packId}
      data-crew-active={member.active ? 'true' : 'false'}
      data-crew-station={member.station}
      data-action={actor.action.id}
      data-pose={actor.action.pose}
      data-shadow-profile={shadowProfile}
      style={{
        '--assistant-x': `${actor.x}%`,
        '--assistant-y': `${actor.y}%`,
        '--assistant-facing': actor.facing,
        '--assistant-travel': `${actor.segmentMs}ms`,
        zIndex: productionDepthZ(actor.depthY),
      } as CSSProperties}
      aria-hidden="true"
    >
      <span
        className="production-assistant-shadow"
        data-gu-ground-shadow={member.active ? 'main' : member.role}
        data-shadow-profile={shadowProfile}
      />
      <div className="production-assistant-bob">
        <GuAnimatedSprite
          pose={renderedPose}
          manifest={manifest}
          playbackKey={`${member.role}:${actor.action.id}:${visibleEgg?.id ?? 'none'}`}
          paused={!documentVisible}
          reducedMotion={reducedMotion}
        />
      </div>
      <span className="production-crew-role-pin">{member.badgeLabel}</span>
      {visibleEgg?.id === 'golden-acorn' ? <span className="assistant-golden-acorn" /> : null}
      {visibleEgg?.id === 'mini-gu' ? (
        <span className="assistant-mini-gu">
          <span
            className="assistant-mini-gu-shadow"
            data-gu-ground-shadow="mini"
            data-shadow-profile="mini"
          />
          <GuAnimatedSprite
            pose="celebrate"
            manifest={manifest}
            playbackKey={`${member.role}:${visibleEgg.id}`}
            mini
            paused={!documentVisible}
            reducedMotion={reducedMotion}
          />
        </span>
      ) : null}
      {visibleEgg?.id === 'debug-dance' ? <span className="assistant-debug-note">♪</span> : null}
    </div>
  );
}

export function configuredProductionCrewMembers(
  stage: PipelineStage,
  status: ProjectStatus,
  configuredCrew: readonly GuCrewMember[] | undefined,
  legacyCrewSize: ProductionCrewSize = 4,
): readonly ProductionCrewMember[] {
  if (!configuredCrew?.length) return productionCrewMembers(stage, status, legacyCrewSize);
  const configuredRoles = new Set(configuredCrew.map((member) => member.role));
  const selected = productionCrewMembers(stage, status, 4)
    .filter((member) => configuredRoles.has(member.role));
  if (selected.some((member) => member.active)) return selected;

  const leadRole = configuredCrew[0]?.role;
  const primaryActions = productionAssistantScene(stage, status).actions;
  return selected.map((member) => member.role === leadRole
    ? { ...member, active: true, actions: primaryActions }
    : member);
}

export type GuGroundShadowProfile = 'standing' | 'walking' | 'sleeping';

/**
 * Keeps the contact shadow tied to locomotion instead of individual sprite crops.
 * This is exported so renderer smoke tests can verify every pose has a stable profile.
 */
export function guGroundShadowProfile(
  pose: ProductionAssistantMotionState['action']['pose'],
  phase: ProductionAssistantMotionState['phase'],
): GuGroundShadowProfile {
  if (pose === 'sleep') return 'sleeping';
  if (pose === 'walk' || phase === 'walking') return 'walking';
  return 'standing';
}

function initialCrewActor(member: ProductionCrewMember): ProductionAssistantMotionState {
  return createProductionAssistantMotion(member.nodeId, member.actions[0]!);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * Copyright (c) 2018-2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { VisualContext } from '../../visual';
import { Unit, Structure } from '../../../mol-model/structure';
import { Theme } from '../../../mol-theme/theme';
import { Mesh } from '../../../mol-geo/geometry/mesh/mesh';
import { MeshBuilder } from '../../../mol-geo/geometry/mesh/mesh-builder';
import { Vec3 } from '../../../mol-math/linear-algebra';
import { CylinderProps } from '../../../mol-geo/primitive/cylinder';
import { eachPolymerElement, getPolymerElementLoci, NucleicShift, PolymerBackboneIterator, PolymerLocationIterator, StandardShift } from './util/polymer';
import { addCylinder } from '../../../mol-geo/geometry/mesh/builder/cylinder';
import { UnitsMeshParams, UnitsVisual, UnitsMeshVisual, UnitsCylindersVisual, UnitsCylindersParams, StructureGroup } from '../units-visual';
import { VisualUpdateState } from '../../util';
import { BaseGeometry } from '../../../mol-geo/geometry/base';
import { Sphere3D } from '../../../mol-math/geometry';
import { isNucleic } from '../../../mol-model/structure/model/types';
import { WebGLContext } from '../../../mol-gl/webgl/context';
import { Cylinders } from '../../../mol-geo/geometry/cylinders/cylinders';
import { CylindersBuilder } from '../../../mol-geo/geometry/cylinders/cylinders-builder';

// avoiding namespace lookup improved performance in Chrome (Aug 2020)
const v3scale = Vec3.scale;
const v3add = Vec3.add;
const v3sub = Vec3.sub;

export const PolymerBackboneCylinderParams = {
    ...UnitsMeshParams,
    ...UnitsCylindersParams,
    sizeFactor: PD.Numeric(0.3, { min: 0, max: 10, step: 0.01 }),
    radialSegments: PD.Numeric(16, { min: 2, max: 56, step: 2 }, BaseGeometry.CustomQualityParamInfo),
    tryUseImpostor: PD.Boolean(true),
};
export type PolymerBackboneCylinderParams = typeof PolymerBackboneCylinderParams

export function PolymerBackboneCylinderVisual(materialId: number, structure: Structure, props: PD.Values<PolymerBackboneCylinderParams>, webgl?: WebGLContext) {
    return props.tryUseImpostor && webgl && webgl.extensions.fragDepth
        ? PolymerBackboneCylinderImpostorVisual(materialId)
        : PolymerBackboneCylinderMeshVisual(materialId);
}

interface PolymerBackboneCylinderProps {
    radialSegments: number,
    sizeFactor: number,
}

function createPolymerBackboneCylinderImpostor(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PolymerBackboneCylinderProps, cylinders?: Cylinders) {
    const polymerElementCount = unit.polymerElements.length;
    if (!polymerElementCount) return Cylinders.createEmpty(cylinders);

    const cylindersCountEstimate = polymerElementCount * 2;
    const builder = CylindersBuilder.create(cylindersCountEstimate, cylindersCountEstimate / 4, cylinders);

    const pos = unit.conformation.invariantPosition;
    const pA = Vec3();
    const pB = Vec3();
    const pM = Vec3();

    const polymerBackboneIt = PolymerBackboneIterator(structure, unit);
    while (polymerBackboneIt.hasNext) {
        const { centerA, centerB, moleculeType, indexA, indexB } = polymerBackboneIt.move();
        pos(centerA.element, pA);
        pos(centerB.element, pB);

        const isNucleicType = isNucleic(moleculeType);
        const shift = isNucleicType ? NucleicShift : StandardShift;

        v3add(pM, pA, v3scale(pM, v3sub(pM, pB, pA), shift));
        builder.add(pA[0], pA[1], pA[2], pM[0], pM[1], pM[2], 1, false, false, indexA);
        builder.add(pM[0], pM[1], pM[2], pB[0], pB[1], pB[2], 1, false, false, indexB);
    }

    const c = builder.getCylinders();

    const sphere = Sphere3D.expand(Sphere3D(), unit.boundary.sphere, 1 * props.sizeFactor);
    c.setBoundingSphere(sphere);

    return c;
}

export function PolymerBackboneCylinderImpostorVisual(materialId: number): UnitsVisual<PolymerBackboneCylinderParams> {
    return UnitsCylindersVisual<PolymerBackboneCylinderParams>({
        defaultProps: PD.getDefaultValues(PolymerBackboneCylinderParams),
        createGeometry: createPolymerBackboneCylinderImpostor,
        createLocationIterator: PolymerLocationIterator.fromGroup,
        getLoci: getPolymerElementLoci,
        eachLocation: eachPolymerElement,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<PolymerBackboneCylinderParams>, currentProps: PD.Values<PolymerBackboneCylinderParams>) => { },
        mustRecreate: (structureGroup: StructureGroup, props: PD.Values<PolymerBackboneCylinderParams>, webgl?: WebGLContext) => {
            return !props.tryUseImpostor || !webgl;
        }
    }, materialId);
}

function createPolymerBackboneCylinderMesh(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PolymerBackboneCylinderProps, mesh?: Mesh) {
    const polymerElementCount = unit.polymerElements.length;
    if (!polymerElementCount) return Mesh.createEmpty(mesh);

    const { radialSegments, sizeFactor } = props;

    const vertexCountEstimate = radialSegments * 2 * polymerElementCount * 2;
    const builderState = MeshBuilder.createState(vertexCountEstimate, vertexCountEstimate / 10, mesh);

    const pos = unit.conformation.invariantPosition;
    const pA = Vec3();
    const pB = Vec3();
    const cylinderProps: CylinderProps = { radiusTop: 1, radiusBottom: 1, radialSegments };

    const polymerBackboneIt = PolymerBackboneIterator(structure, unit);
    while (polymerBackboneIt.hasNext) {
        const { centerA, centerB, moleculeType, indexA, indexB } = polymerBackboneIt.move();
        pos(centerA.element, pA);
        pos(centerB.element, pB);

        const isNucleicType = isNucleic(moleculeType);
        const shift = isNucleicType ? NucleicShift : StandardShift;

        cylinderProps.radiusTop = cylinderProps.radiusBottom = theme.size.size(centerA) * sizeFactor;
        builderState.currentGroup = indexA;
        addCylinder(builderState, pA, pB, shift, cylinderProps);

        cylinderProps.radiusTop = cylinderProps.radiusBottom = theme.size.size(centerB) * sizeFactor;
        builderState.currentGroup = indexB;
        addCylinder(builderState, pB, pA, 1 - shift, cylinderProps);
    }

    const m = MeshBuilder.getMesh(builderState);

    const sphere = Sphere3D.expand(Sphere3D(), unit.boundary.sphere, 1 * props.sizeFactor);
    m.setBoundingSphere(sphere);

    return m;
}

export function PolymerBackboneCylinderMeshVisual(materialId: number): UnitsVisual<PolymerBackboneCylinderParams> {
    return UnitsMeshVisual<PolymerBackboneCylinderParams>({
        defaultProps: PD.getDefaultValues(PolymerBackboneCylinderParams),
        createGeometry: createPolymerBackboneCylinderMesh,
        createLocationIterator: PolymerLocationIterator.fromGroup,
        getLoci: getPolymerElementLoci,
        eachLocation: eachPolymerElement,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<PolymerBackboneCylinderParams>, currentProps: PD.Values<PolymerBackboneCylinderParams>) => {
            state.createGeometry = (
                newProps.sizeFactor !== currentProps.sizeFactor ||
                newProps.radialSegments !== currentProps.radialSegments
            );
        },
        mustRecreate: (structureGroup: StructureGroup, props: PD.Values<PolymerBackboneCylinderParams>, webgl?: WebGLContext) => {
            return props.tryUseImpostor && !!webgl;
        }
    }, materialId);
}
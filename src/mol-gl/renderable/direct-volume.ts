/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Renderable, RenderableState, createRenderable } from '../renderable'
import { Context } from '../webgl/context';
import { createRenderItem } from '../webgl/render-item';
import { AttributeSpec, Values, UniformSpec, GlobalUniformSchema, InternalSchema, TextureSpec, ValueSpec, ElementsSpec, DefineSpec, InternalValues } from './schema';
import { DirectVolumeShaderCode } from '../shader-code';
import { ValueCell } from 'mol-util';

export const DirectVolumeBaseSchema = {
    drawCount: ValueSpec('number'),
    instanceCount: ValueSpec('number'),

    aPosition: AttributeSpec('float32', 3, 0),
    elements: ElementsSpec('uint32'),

    uAlpha: UniformSpec('f'),
    dUseFog: DefineSpec('boolean'),

    uIsoValue: UniformSpec('f'),
    uBboxMin: UniformSpec('v3'),
    uBboxMax: UniformSpec('v3'),
    uBboxSize: UniformSpec('v3'),
    dMaxSteps: DefineSpec('number'),
    uTransform: UniformSpec('m4'),
    uGridDim: UniformSpec('v3'),
    dRenderMode: DefineSpec('string', ['isosurface', 'volume']),
    tTransferTex: TextureSpec('image-uint8', 'rgba', 'ubyte', 'linear'),
}
export type DirectVolumeBaseSchema = typeof DirectVolumeBaseSchema
export type DirectVolumeBaseValues = Values<DirectVolumeBaseSchema>

function getInternalValues(ctx: Context, id: number, version: '100es' | '300es'): InternalValues {
    return {
        uObjectId: ValueCell.create(id)
    }
}

function DirectVolumeRenderable<T extends DirectVolumeBaseValues, S extends DirectVolumeBaseSchema>(ctx: Context, id: number, values: T, state: RenderableState, schema: S, version: '100es' | '300es'): Renderable<T> {
    const fullSchema = Object.assign({}, GlobalUniformSchema, InternalSchema, schema)
    const internalValues = getInternalValues(ctx, id, version)
    const fullValues = Object.assign({}, values, internalValues)
    const shaderCode = DirectVolumeShaderCode
    const renderItem = createRenderItem(ctx, 'triangles', shaderCode, fullSchema, fullValues)
    const renderable = createRenderable(renderItem, values, state);

    Object.defineProperty(renderable, 'opaque', { get: () => false });

    return renderable
}

// via 2d texture

export const DirectVolume2dSchema = {
    ...DirectVolumeBaseSchema,
    dGridTexType: DefineSpec('string', ['2d']),
    uGridTexDim: UniformSpec('v2'),
    tGridTex: TextureSpec('image-uint8', 'rgba', 'ubyte', 'linear'),
}
export type DirectVolume2dSchema = typeof DirectVolume2dSchema
export type DirectVolume2dValues = Values<DirectVolume2dSchema>

export function DirectVolume2dRenderable(ctx: Context, id: number, values: DirectVolume2dValues, state: RenderableState): Renderable<DirectVolume2dValues> {
    return DirectVolumeRenderable(ctx, id, values, state, DirectVolume2dSchema, '100es')
}

// via 3d texture

export const DirectVolume3dSchema = {
    ...DirectVolumeBaseSchema,
    dGridTexType: DefineSpec('string', ['3d']),
    tGridTex: TextureSpec('volume-uint8', 'rgba', 'ubyte', 'linear'),
}
export type DirectVolume3dSchema = typeof DirectVolume3dSchema
export type DirectVolume3dValues = Values<DirectVolume3dSchema>

export function DirectVolume3dRenderable(ctx: Context, id: number, values: DirectVolume3dValues, state: RenderableState): Renderable<DirectVolume3dValues> {
    return DirectVolumeRenderable(ctx, id, values, state, DirectVolume3dSchema, '300es')
}
/* Every colour the city uses, by season. Flat colours, soft light: the look is
   "toy town at golden hour", not realism. */

import type { Season } from '../../city/season'

export interface Palette {
  sky: string
  grass: string
  grassAlt: string
  park: string
  dirt: string
  water: string
  road: string
  roadLine: string
  sidewalk: string
  earth: string
  leaves: string[]
  roofSnow: boolean
  groundSnow: number
}

export const PALETTES: Record<Season, Palette> = {
  spring: {
    sky: '#1a1d2a',
    grass: '#7fae5a',
    grassAlt: '#8bb862',
    park: '#6ea64f',
    dirt: '#a88a62',
    water: '#3f7fa6',
    road: '#3b3f4c',
    roadLine: '#e8dfb8',
    sidewalk: '#b9b2a2',
    earth: '#6b5640',
    leaves: ['#f2a7c3', '#79b04f', '#e98fb3', '#6fa84a'],
    roofSnow: false,
    groundSnow: 0,
  },
  summer: {
    sky: '#1a1d2a',
    grass: '#5f9e48',
    grassAlt: '#69a84f',
    park: '#4f9440',
    dirt: '#b3926a',
    water: '#2f86b8',
    road: '#3b3f4c',
    roadLine: '#f2e7bb',
    sidewalk: '#bdb6a6',
    earth: '#6b5640',
    leaves: ['#3f8a3a', '#4f9a3f', '#2f7a35', '#5aa548'],
    roofSnow: false,
    groundSnow: 0,
  },
  fall: {
    sky: '#1c1b26',
    grass: '#8f9a55',
    grassAlt: '#9aa15b',
    park: '#868f4c',
    dirt: '#a5845c',
    water: '#3a6f93',
    road: '#3b3f4c',
    roadLine: '#e8dcb0',
    sidewalk: '#b5ac9a',
    earth: '#6b5640',
    leaves: ['#d9772b', '#c9502e', '#e3a93a', '#a8432a'],
    roofSnow: false,
    groundSnow: 0,
  },
  winter: {
    sky: '#171a25',
    grass: '#e6ebef',
    grassAlt: '#dde3e8',
    park: '#d8dfe5',
    dirt: '#c9cbcf',
    water: '#7fa3bb',
    road: '#454a57',
    roadLine: '#d9d9d9',
    sidewalk: '#c4c7cc',
    earth: '#5d5248',
    leaves: ['#2f5e45', '#e9eef2', '#35664b', '#f1f4f6'],
    roofSnow: true,
    groundSnow: 1,
  },
}

/** House paint. Picked per lot by hash. */
export const WALLS = [
  '#e9dcc3',
  '#d9c7a7',
  '#c9d6df',
  '#e3c9b4',
  '#d6d0c4',
  '#b8c7b0',
  '#e8d6a0',
  '#cfb9a6',
  '#f0e9dc',
  '#a9b8c9',
]
export const ROOFS = [
  '#8a3b32',
  '#5b4a3f',
  '#3e4a5c',
  '#6e5a3a',
  '#7a2f2a',
  '#4a4f57',
]
export const GLASS = ['#6f8fa8', '#5f7f9a', '#7d9bb2', '#58728a']
export const TOWER = ['#c9c4b8', '#b7b2a6', '#d8d3c6', '#9ea7b0']
export const TENTS = ['#d9772b', '#3f7fa6', '#5a9a48', '#c8372d', '#c9a227']

export const BRASS = '#c9a227'
export const BRASS_LIGHT = '#e9c94a'
export const MARBLE = '#f5f2ea'
export const SOLD_RED = '#c8372d'
export const INDIE_GREY = '#8c8f9e'
/** A client in your pipeline. */
export const CLIENT = '#5fd39a'

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLACES } from '../../data/places'
import { Graph } from './graph'
import { Planner } from './planner'
import { applyOption, buildTrip, chooseStop, emptyState, setCrossing, setNights, suggest, toggleFirm, tripOptions, whatIfHeart } from './trip'

let pl: Planner
beforeAll(() => {
  pl = new Planner(new Graph(JSON.parse(readFileSync('public/data/matrix.json', 'utf8'))), JSON.parse(readFileSync('public/data/curated.json', 'utf8')).days)
})

describe('trip ideas', () => {
  it('builds three different complete trips with five stops each way', () => {
    const opts = tripOptions(pl, emptyState())
    expect(opts.length).toBe(3)
    for (const o of opts) {
      expect(o.out.places.length).toBe(5)
      expect(o.ret.places.length).toBe(5)
      // no day wildly over the 5.5 h budget
      for (const d of [...o.out.days, ...o.ret.days]) expect(d.min).toBeLessThanOrEqual(5.5 * 60 + 100)
    }
    expect(new Set(opts.map((o) => o.id)).size).toBe(3)
  })

  it('bends around hearts', () => {
    const st = emptyState()
    st.hearts.tatiana = ['hallstatt']
    st.hearts.liam = ['hallstatt', 'grossglockner']
    const [best] = tripOptions(pl, st)
    expect(best.covered).toContain('hallstatt')
    expect(best.covered).toContain('grossglockner')
  })

  it('an overnight ferry leaves four road stops that way', () => {
    const st = applyOption(emptyState(), tripOptions(pl, emptyState())[0])
    const f = setCrossing(pl, st, 'out', 'ferry')
    expect(f.out.stops.length).toBe(4)
    const trip = buildTrip(pl, f)
    expect(trip.nights).toBe(14)
    expect(trip.days[0].kind).toBe('ferry-night')
  })
})

describe('the day-by-day plan', () => {
  it('is 14 nights: five out, four in Slovenia, five back', () => {
    const st = applyOption(emptyState('2027-05-10'), tripOptions(pl, emptyState())[0])
    const trip = buildTrip(pl, st)
    expect(trip.nights).toBe(14)
    expect(trip.days.filter((d) => d.kind === 'base').length).toBe(3)
    expect(trip.days[0].date).toBe('2027-05-10')
    expect(trip.endDate).toBe('2027-05-24')
    expect(trip.days.at(-1)!.sleep).toBe('home')
  })

  it('two nights somewhere drops a stop and keeps the total', () => {
    const st = applyOption(emptyState(), tripOptions(pl, emptyState())[0])
    const two = setNights(pl, st, 'out', 1, 2)
    expect(two.out.stops.length).toBe(4)
    expect(two.out.stops[1].nights).toBe(2)
    expect(buildTrip(pl, two).nights).toBe(14)
  })
})

describe('suggestions', () => {
  it('after Bruges, stops back in France are flagged (and hidden by default)', () => {
    let st = applyOption(emptyState(), tripOptions(pl, emptyState())[0])
    st = chooseStop(pl, st, 'out', 0, 'bruges')
    expect(st.out.stops[0].place).toBe('bruges')
    const { list } = suggest(pl, st, 'out', 1)
    expect(list.length).toBeGreaterThan(5)
    for (const s of list) {
      if (PLACES[s.place].country === 'FR') expect(s.reenter).toBe('FR')
      else expect(s.reenter).toBeNull()
    }
    // every suggestion moves toward Slovenia
    for (const s of list) expect(pl.graph.min(`p:${s.place}`, 'p:ljubljana')).toBeLessThan(pl.graph.min('p:bruges', 'p:ljubljana'))
  })

  it('shows what a choice does to your hearts before you make it', () => {
    let st = applyOption(emptyState(), tripOptions(pl, emptyState())[0])
    st = { ...st, hearts: { liam: ['hallstatt'], tatiana: [] } }
    const [best] = tripOptions(pl, st)
    st = applyOption(st, best)
    const { list } = suggest(pl, st, 'out', 1)
    // some option must lose Hallstatt (e.g. heading west via Switzerland) and say so
    expect(list.some((s) => s.lost.includes('hallstatt')) || list.every((s) => !s.lost.length)).toBe(true)
    for (const s of list) expect(s.completion.places[1]).toBe(s.place)
  })

  it('booked stops never move when re-planning', () => {
    let st = applyOption(emptyState(), tripOptions(pl, emptyState())[0])
    st = toggleFirm(st, 'out', 3)
    const booked = st.out.stops[3].place
    st = chooseStop(pl, st, 'out', 0, st.out.stops[0].place === 'ghent' ? 'bruges' : 'ghent')
    expect(st.out.stops[3].place).toBe(booked)
    expect(st.out.stops[3].firm).toBe(true)
  })

  it('"what would it take" fits a missed heart in', () => {
    const st = applyOption(emptyState(), tripOptions(pl, emptyState())[0])
    const trip = buildTrip(pl, st)
    const covered = new Set([...trip.out.covered, ...trip.ret.covered])
    const target = ['hallstatt', 'lake-como', 'grossglockner', 'bruges'].find((h) => !covered.has(h))!
    const w = whatIfHeart(pl, { ...st, hearts: { liam: [target], tatiana: [] } }, target)
    expect(w).not.toBeNull()
    const t2 = buildTrip(pl, w!.st)
    expect([...t2.out.covered, ...t2.ret.covered]).toContain(target)
  })
})

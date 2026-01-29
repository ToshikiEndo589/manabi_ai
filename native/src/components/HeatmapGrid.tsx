import React from 'react'
import { StyleSheet, View } from 'react-native'

type HeatmapGridProps = {
  values: number[]
}

const getColor = (minutes: number) => {
  if (minutes >= 120) return '#4f46e5'
  if (minutes >= 60) return '#6366f1'
  if (minutes >= 30) return '#a5b4fc'
  if (minutes >= 10) return '#e0e7ff'
  return '#f3f4f6'
}

export function HeatmapGrid({ values }: HeatmapGridProps) {
  return (
    <View style={styles.grid}>
      {values.map((minutes, index) => (
        <View key={`heat-${index}`} style={[styles.cell, { backgroundColor: getColor(minutes) }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cell: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
})

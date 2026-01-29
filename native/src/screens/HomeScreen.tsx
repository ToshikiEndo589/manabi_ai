import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useProfile } from '../contexts/ProfileContext'

export function HomeScreen() {
  const { profile } = useProfile()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>こんにちは！</Text>
      <Text style={styles.subtitle}>今日も学習を進めましょう。</Text>
      {profile && (
        <View style={styles.card}>
          <Text style={styles.label}>志望校</Text>
          <Text style={styles.value}>{profile.school_name}</Text>
          <Text style={styles.label}>現在偏差値 / 目標偏差値</Text>
          <Text style={styles.value}>
            {profile.current_deviation} / {profile.target_deviation}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 8,
  },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
})

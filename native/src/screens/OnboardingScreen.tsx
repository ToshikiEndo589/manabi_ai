import React, { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { useProfile } from '../contexts/ProfileContext'

export function OnboardingScreen() {
  const { createProfile } = useProfile()
  const [schoolName, setSchoolName] = useState('')
  const [currentDeviation, setCurrentDeviation] = useState('')
  const [targetDeviation, setTargetDeviation] = useState('')
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!schoolName || !currentDeviation || !targetDeviation) {
      Alert.alert('入力エラー', '志望校名と偏差値を入力してください。')
      return
    }

    setLoading(true)
    try {
      await createProfile({
        school_name: schoolName,
        current_deviation: Number(currentDeviation),
        target_deviation: Number(targetDeviation),
        exam_date: examDate ? examDate : null,
      })
    } catch (error: any) {
      Alert.alert('保存エラー', error?.message ?? 'オンボーディングに失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>初回設定</Text>
      <TextInput
        style={styles.input}
        placeholder="志望校名"
        value={schoolName}
        onChangeText={setSchoolName}
      />
      <TextInput
        style={styles.input}
        placeholder="現在偏差値"
        keyboardType="numeric"
        value={currentDeviation}
        onChangeText={setCurrentDeviation}
      />
      <TextInput
        style={styles.input}
        placeholder="目標偏差値"
        keyboardType="numeric"
        value={targetDeviation}
        onChangeText={setTargetDeviation}
      />
      <TextInput
        style={styles.input}
        placeholder="試験日 (YYYY-MM-DD)"
        value={examDate}
        onChangeText={setExamDate}
      />
      <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? '保存中...' : '保存する'}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})

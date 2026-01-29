import React, { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'

export function SettingsScreen() {
  const { profile, updateProfile } = useProfile()
  const [schoolName, setSchoolName] = useState('')
  const [currentDeviation, setCurrentDeviation] = useState('')
  const [targetDeviation, setTargetDeviation] = useState('')
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      setSchoolName(profile.school_name)
      setCurrentDeviation(String(profile.current_deviation))
      setTargetDeviation(String(profile.target_deviation))
      setExamDate(profile.exam_date ?? '')
    }
  }, [profile])

  const handleUpdate = async () => {
    if (!profile) return
    setLoading(true)
    try {
      await updateProfile({
        school_name: schoolName,
        current_deviation: Number(currentDeviation),
        target_deviation: Number(targetDeviation),
        exam_date: examDate ? examDate : null,
      })
      Alert.alert('更新完了', 'プロフィールを更新しました。')
    } catch (error: any) {
      Alert.alert('更新エラー', error?.message ?? '更新に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>プロフィール設定</Text>
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
      <Pressable style={styles.primaryButton} onPress={handleUpdate} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? '更新中...' : '更新する'}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={handleLogout}>
        <Text style={styles.secondaryButtonText}>ログアウト</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
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
  secondaryButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ef4444',
    fontSize: 14,
  },
})

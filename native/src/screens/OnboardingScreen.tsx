import React, { useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useProfile } from '../contexts/ProfileContext'

export function OnboardingScreen() {
  const { createProfile } = useProfile()
  const [schoolName, setSchoolName] = useState('')
  const [currentDeviation, setCurrentDeviation] = useState('')
  const [targetDeviation, setTargetDeviation] = useState('')
  const [examDate, setExamDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mascot = `${(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png`

  const handleSubmit = async () => {
    if (!schoolName || !currentDeviation || !targetDeviation) {
      setError('志望校名と偏差値を入力してください。')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await createProfile({
        school_name: schoolName,
        current_deviation: Number(currentDeviation),
        target_deviation: Number(targetDeviation),
        exam_date: examDate ? examDate : null,
      })
    } catch (error: any) {
      setError(error?.message ?? 'オンボーディングに失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.mascotWrap}>
          <Image source={{ uri: mascot }} style={styles.mascot} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>初回設定</Text>
          <Text style={styles.cardSubtitle}>志望校、現在の偏差値、試験日を入力してください</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Text style={styles.label}>志望校名</Text>
          <TextInput
            style={styles.input}
            placeholder="例: 東京大学"
            value={schoolName}
            onChangeText={setSchoolName}
          />
          <Text style={styles.label}>現在の偏差値</Text>
          <TextInput
            style={styles.input}
            placeholder="50"
            keyboardType="numeric"
            value={currentDeviation}
            onChangeText={(value) => {
              setCurrentDeviation(value)
              setTargetDeviation(value)
            }}
          />
          <Text style={styles.label}>目標偏差値</Text>
          <TextInput
            style={styles.input}
            placeholder="50"
            keyboardType="numeric"
            value={targetDeviation}
            onChangeText={setTargetDeviation}
          />
          <Text style={styles.helperText}>初期値は現在の偏差値と同じ値に設定されます</Text>
          <Text style={styles.label}>試験日（任意）</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={examDate}
            onChangeText={setExamDate}
          />
          <Text style={styles.helperText}>後から設定で変更できます</Text>
          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? '処理中...' : '設定を完了する'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
  },
  mascotWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  mascot: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#475569',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    fontSize: 14,
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 6,
  },
})

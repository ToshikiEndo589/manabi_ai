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
  TouchableOpacity,
  Switch,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useProfile } from '../contexts/ProfileContext'
import { SafeAreaView } from 'react-native-safe-area-context'

const STEPS = ['基本情報', '利用目的', '学習目標']
const PURPOSES = ['大学受験', '資格取得', 'その他']
const GENDERS = ['男性', '女性']

export function OnboardingScreen() {
  const { createProfile } = useProfile()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Basic Info
  const [username, setUsername] = useState('')
  const [birthDate, setBirthDate] = useState(new Date(2008, 0, 1))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [gender, setGender] = useState('')

  // Step 2: Purpose
  const [purposes, setPurposes] = useState<string[]>([])

  // Step 3: Goals
  const [weekdayTarget, setWeekdayTarget] = useState('60')
  const [weekendTarget, setWeekendTarget] = useState('120')

  const mascot = `${(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png`

  const handleNext = () => {
    setError(null)
    if (currentStep === 0) {
      if (!username.trim()) {
        setError('ユーザーネームを入力してください。')
        return
      }
      if (!gender) {
        setError('性別を選択してください。')
        return
      }
    } else if (currentStep === 1) {
      if (purposes.length === 0) {
        setError('利用目的を少なくとも1つ選択してください。')
        return
      }
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setError(null)
    setCurrentStep((prev) => prev - 1)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      await createProfile({
        username,
        birth_date: birthDate.toISOString().split('T')[0],
        gender,
        study_purpose: purposes,
        weekday_target_minutes: Number(weekdayTarget),
        weekend_target_minutes: Number(weekendTarget),
        // Legacy fields (hidden)
        school_name: '',
        current_deviation: 0,
        target_deviation: 0,
        exam_date: null,
      })
    } catch (error: any) {
      setError(error?.message ?? 'オンボーディングに失敗しました。')
      setLoading(false)
    }
  }

  const togglePurpose = (purpose: string) => {
    if (purposes.includes(purpose)) {
      setPurposes(purposes.filter((p) => p !== purpose))
    } else {
      setPurposes([...purposes, purpose])
    }
  }

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((step, index) => (
        <View key={step} style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              index <= currentStep && styles.stepCircleActive,
            ]}
          >
            <Text
              style={[
                styles.stepNumber,
                index <= currentStep && styles.stepNumberActive,
              ]}
            >
              {index + 1}
            </Text>
          </View>
          <Text
            style={[
              styles.stepLabel,
              index <= currentStep && styles.stepLabelActive,
            ]}
          >
            {step}
          </Text>
          {index < STEPS.length - 1 && <View style={styles.stepLine} />}
        </View>
      ))}
    </View>
  )

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>基本情報を教えてください</Text>

      <Text style={styles.label}>ユーザーネーム</Text>
      <TextInput
        style={styles.input}
        placeholder="例: まなび太郎"
        value={username}
        onChangeText={setUsername}
      />

      <Text style={styles.label}>生年月日</Text>
      <Pressable
        style={styles.dateInput}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateText}>
          {birthDate.getFullYear()}年 {birthDate.getMonth() + 1}月 {birthDate.getDate()}日
        </Text>
      </Pressable>
      {showDatePicker && (
        <View>
          {Platform.OS === 'ios' && (
            <View style={styles.datePickerHeader}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerDoneButton}
              >
                <Text style={styles.datePickerDoneText}>完了</Text>
              </TouchableOpacity>
            </View>
          )}
          <DateTimePicker
            value={birthDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            locale="ja-JP"
            onChange={(event, selectedDate) => {
              if (Platform.OS === 'android') {
                setShowDatePicker(false)
              }
              if (selectedDate) setBirthDate(selectedDate)
            }}
            maximumDate={new Date()}
          />
        </View>
      )}

      <Text style={styles.label}>性別</Text>
      <View style={styles.genderContainer}>
        {GENDERS.map((g) => (
          <Pressable
            key={g}
            style={[
              styles.genderButton,
              gender === g && styles.genderButtonActive,
            ]}
            onPress={() => setGender(g)}
          >
            <Text
              style={[
                styles.genderText,
                gender === g && styles.genderTextActive,
              ]}
            >
              {g}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>利用目的を教えてください</Text>
      <Text style={styles.stepSubtitle}>複数選択可能です</Text>

      <View style={styles.purposeList}>
        {PURPOSES.map((purpose) => (
          <Pressable
            key={purpose}
            style={[
              styles.purposeItem,
              purposes.includes(purpose) && styles.purposeItemActive,
            ]}
            onPress={() => togglePurpose(purpose)}
          >
            <Text
              style={[
                styles.purposeText,
                purposes.includes(purpose) && styles.purposeTextActive,
              ]}
            >
              {purpose}
            </Text>
            {purposes.includes(purpose) && (
              <View style={styles.checkIcon}>
                <Text style={styles.checkIconText}>✓</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  )

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>1日の学習目標を決めましょう</Text>

      <View style={styles.targetContainer}>
        <Text style={styles.label}>平日の目標学習時間（分）</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={weekdayTarget}
          onChangeText={setWeekdayTarget}
          placeholder="例: 60"
        />
      </View>

      <View style={styles.targetContainer}>
        <Text style={styles.label}>休日の目標学習時間（分）</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={weekendTarget}
          onChangeText={setWeekendTarget}
          placeholder="例: 120"
        />
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.mascotWrap}>
            <Image source={{ uri: mascot }} style={styles.mascot} />
          </View>
          {renderStepIndicator()}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {error && <Text style={styles.errorText}>{error}</Text>}

          {currentStep === 0 && renderStep1()}
          {currentStep === 1 && renderStep2()}
          {currentStep === 2 && renderStep3()}
        </ScrollView>

        <View style={styles.footer}>
          {currentStep > 0 && (
            <Pressable style={styles.backButton} onPress={handleBack} disabled={loading}>
              <Text style={styles.backButtonText}>戻る</Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.primaryButton, currentStep > 0 && { flex: 1 }]}
            onPress={currentStep === STEPS.length - 1 ? handleSubmit : handleNext}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading
                ? '処理中...'
                : currentStep === STEPS.length - 1
                  ? '設定を完了する'
                  : '次へ'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eff6ff',
  },
  container: {
    flex: 1,
  },
  header: {
    padding: 24, // Increased padding
    paddingTop: 60, // Push mascot down
    backgroundColor: '#eff6ff',
  },
  mascotWrap: {
    alignItems: 'center',
    marginBottom: 20, // Increased margin
  },
  mascot: {
    width: 80, // Slightly larger mascot
    height: 80,
    resizeMode: 'contain',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    zIndex: 1,
  },
  stepCircleActive: {
    backgroundColor: '#2563eb',
  },
  stepNumber: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  stepNumberActive: {
    color: '#ffffff',
  },
  stepLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  stepLabelActive: {
    color: '#2563eb',
    fontWeight: 'bold',
  },
  stepLine: {
    position: 'absolute',
    top: 15,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: '#e2e8f0',
    zIndex: 0,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center', // Center content vertically
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center', // Center step content
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  dateInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#1e293b',
  },
  genderContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center', // Center gender buttons
    marginTop: 10,
  },
  genderButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  genderButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  genderText: {
    color: '#64748b',
    fontSize: 14,
  },
  genderTextActive: {
    color: '#2563eb',
    fontWeight: 'bold',
  },
  purposeList: {
    gap: 12,
  },
  purposeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  purposeItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  purposeText: {
    fontSize: 16,
    color: '#1e293b',
  },
  purposeTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  checkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIconText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  targetContainer: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  errorText: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24, // Increase bottom padding
    backgroundColor: '#eff6ff',
    gap: 12,
  },
  backButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerHeader: {
    width: '100%',
    alignItems: 'flex-end',
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  datePickerDoneButton: {
    padding: 8,
  },
  datePickerDoneText: {
    color: '#2563eb',
    fontWeight: 'bold',
    fontSize: 16,
  },
})

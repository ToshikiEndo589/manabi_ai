import React, { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'

const PURPOSES = ['大学受験', '資格取得', '学校の補習', 'その他']
const GENDERS = ['男性', '女性', 'その他', '回答しない']

export function SettingsScreen() {
  const { profile, updateProfile } = useProfile()

  // Profile Fields
  const [username, setUsername] = useState('')
  const [birthDate, setBirthDate] = useState(new Date(2008, 0, 1))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [gender, setGender] = useState('')
  const [purposes, setPurposes] = useState<string[]>([])

  // Study Targets
  const [weekdayTarget, setWeekdayTarget] = useState('60')
  const [weekendTarget, setWeekendTarget] = useState('120')

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '')
      if (profile.birth_date) {
        setBirthDate(new Date(profile.birth_date))
      }
      setGender(profile.gender || '')
      setPurposes(profile.study_purpose || [])
      setWeekdayTarget(String(profile.weekday_target_minutes ?? 60))
      setWeekendTarget(String(profile.weekend_target_minutes ?? 120))
    }
  }, [profile])

  const handleUpdate = async () => {
    setLoading(true)
    try {
      await updateProfile({
        username,
        birth_date: birthDate.toISOString().split('T')[0],
        gender,
        study_purpose: purposes,
        weekday_target_minutes: Number(weekdayTarget),
        weekend_target_minutes: Number(weekendTarget),
      })
      Alert.alert('更新完了', '設定を更新しました。')
    } catch (error: any) {
      Alert.alert('更新エラー', error?.message ?? '更新に失敗しました。')
    } finally {
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>プロフィール設定</Text>
          <Text style={styles.cardSubtitle}>基本情報を変更できます</Text>

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

          <Text style={styles.label}>利用目的（複数選択可）</Text>
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>学習目標設定</Text>
          <Text style={styles.cardSubtitle}>1日の目標学習時間を設定します</Text>

          <Text style={styles.label}>平日（分）</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={weekdayTarget}
            onChangeText={setWeekdayTarget}
          />
          <Text style={styles.label}>土日祝（分）</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={weekendTarget}
            onChangeText={setWeekendTarget}
          />
        </View>

        <Pressable style={styles.primaryButton} onPress={handleUpdate} disabled={loading}>
          <Text style={styles.primaryButtonText}>{loading ? '更新中...' : '設定を保存する'}</Text>
        </Pressable>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>ログアウト</Text>
        </Pressable>
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
    padding: 16,
    backgroundColor: '#f1f5fb',
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f8fafc',
  },
  dateInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#1e293b',
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
  genderContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genderButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
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
    gap: 8,
  },
  purposeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  purposeItemActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  purposeText: {
    fontSize: 14,
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
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
})

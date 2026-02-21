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
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'

export function SettingsScreen() {
  const { profile, updateProfile } = useProfile()

  // Profile Fields
  const [username, setUsername] = useState('')
  const [birthDate, setBirthDate] = useState(new Date(2008, 0, 1))
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Deletion State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')

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
      setWeekdayTarget(String(profile.weekday_target_minutes ?? 60))
      setWeekendTarget(String(profile.weekend_target_minutes ?? 120))
    }
  }, [profile])

  const handleUpdate = async () => {
    setLoading(true)
    try {
      await updateProfile({
        username,
        birth_date: `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, '0')}-${String(birthDate.getDate()).padStart(2, '0')}`,
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const handleDeleteAccount = () => {
    setDeleteModalVisible(true)
  }

  const executeDeleteAccount = async () => {
    if (!deleteReason.trim()) {
      Alert.alert('エラー', '退会理由を入力してください。')
      return
    }

    Alert.alert(
      '最終確認',
      '本当に退会しますか？\nすべてのデータが削除され、復元することはできません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '退会する',
          style: 'destructive',
          onPress: async () => {
            setLoading(true)
            try {
              const { error } = await supabase.rpc('delete_user', { reason: deleteReason })
              if (error) throw error
              await supabase.auth.signOut()
              setDeleteModalVisible(false)
              Alert.alert('完了', 'アカウントを削除しました。')
            } catch (error: any) {
              Alert.alert('エラー', error?.message ?? '削除に失敗しました。')
              setLoading(false)
            }
          },
        },
      ]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* ... existing card views ... */}

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

        <Pressable style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
          <Text style={styles.deleteAccountText}>アカウントを削除（退会）</Text>
        </Pressable>

        <Modal
          animationType="slide"
          transparent={true}
          visible={deleteModalVisible}
          onRequestClose={() => setDeleteModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback
              onPress={() => Keyboard.dismiss()}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>退会手続き</Text>
                <Text style={styles.modalText}>
                  退会理由を入力してください。{'\n'}
                  この操作は取り消せません。
                </Text>

                <TextInput
                  style={styles.textArea}
                  multiline
                  numberOfLines={4}
                  placeholder="退会理由をご記入ください"
                  value={deleteReason}
                  onChangeText={setDeleteReason}
                />

                <View style={styles.modalButtons}>
                  <Pressable
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => setDeleteModalVisible(false)}
                  >
                    <Text style={styles.modalButtonText}>キャンセル</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalButton, styles.modalButtonDelete]}
                    onPress={executeDeleteAccount}
                    disabled={loading}
                  >
                    <Text style={[styles.modalButtonText, styles.modalButtonTextDelete]}>
                      {loading ? '処理中...' : '退会する'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
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
  deleteAccountButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  deleteAccountText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    height: 120,
    textAlignVertical: 'top',
    backgroundColor: '#f8fafc',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f1f5f9',
  },
  modalButtonDelete: {
    backgroundColor: '#ef4444',
  },
  modalButtonText: {
    fontWeight: '600',
    color: '#64748b',
  },
  modalButtonTextDelete: {
    color: '#ffffff',
  },
})

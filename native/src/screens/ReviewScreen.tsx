import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    Alert,
    Dimensions,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Modal,
    KeyboardAvoidingView,
    Platform,
    PanResponder,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { ReviewTask } from '../types'
import { calculateSM2, getNextDueDate } from '../lib/sm2'
import type { SM2Rating } from '../lib/sm2'
import { formatDateLabel, getStudyDay, getStudyDayDate, getTodayStart } from '../lib/date'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync as imageManipulateAsync, SaveFormat as ImageSaveFormat } from 'expo-image-manipulator'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Image } from 'react-native'
import type { ReferenceBook } from '../types'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CROP_HANDLE_SIZE = 24
const CROP_EDGE_HIT = 14
const CROP_MIN_REL = 0.05
type CropRect = { x: number; y: number; width: number; height: number }
type CropHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'top' | 'bottom' | 'left' | 'right' | 'center' | null

const DEFAULT_DIFFICULTY = 'normal'

type Difficulty = 'easy' | 'normal' | 'hard'

type QuizQuestion = {
    question: string
    choices: string[]
    correct_index: number
    explanation?: string
    theme?: string
}

type ThemeQuizState = {
    loading: boolean
    questions: QuizQuestion[]
    answers: Record<number, number>
}

type QuizState = {
    themes: Record<string, ThemeQuizState>
}

export function ReviewScreen() {
    const { userId } = useProfile()
    const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>([])
    const [quizByTask, setQuizByTask] = useState<Record<string, QuizState>>({})
    const [skippedThemes, setSkippedThemes] = useState<Record<string, string[]>>({})
    /** 1タスク内で「完璧/うろ覚え/苦手」を押したテーマ（全テーマ終わるまでタスクは消さない） */
    const [completedThemesInTask, setCompletedThemesInTask] = useState<Record<string, string[]>>({})
    /** テーマごとの評価（全テーマ終了時に一番厳しい評価でSM-2を更新） */
    const [themeRatingsInTask, setThemeRatingsInTask] = useState<Record<string, SM2Rating>>({})
    const [difficultyByTheme, setDifficultyByTheme] = useState<Record<string, Difficulty>>({})
    const [flashcardMode, setFlashcardMode] = useState<Record<string, boolean>>({})
    const [showingAnswer, setShowingAnswer] = useState<Record<string, boolean>>({})
    const [editingThemeKey, setEditingThemeKey] = useState<string | null>(null)
    const [editingThemeText, setEditingThemeText] = useState<string>('')
    const [loading, setLoading] = useState(true)

    // Creation modal states
    const [showCreateModal, setShowCreateModal] = useState(false)
    type CreateMode = 'ai' | 'flashcard'
    const [createMode, setCreateMode] = useState<CreateMode>('ai')
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [selectedSubjectKey, setSelectedSubjectKey] = useState<string | null>(null)

    // Book selection states
    const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
    const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
    const [showBookPicker, setShowBookPicker] = useState(false)
    const [showAddBookForm, setShowAddBookForm] = useState(false)
    const [newBookName, setNewBookName] = useState('')
    const [newBookImage, setNewBookImage] = useState<string | null>(null)
    const [editingBookId, setEditingBookId] = useState<string | null>(null)

    const [aiNotes, setAiNotes] = useState<string[]>([''])
    type FlashcardItem = { question: string; answer: string }
    const [flashcards, setFlashcards] = useState<FlashcardItem[]>([{ question: '', answer: '' }])

    const endpoint = useMemo(() => {
        const direct = process.env.EXPO_PUBLIC_QA_ENDPOINT
        const base = process.env.EXPO_PUBLIC_API_BASE_URL
        try {
            if (direct) {
                const u = new URL(direct)
                u.pathname = '/api/quiz'
                u.search = ''
                u.hash = ''
                return u.toString()
            }
        } catch {
            // fall through to base/env fallback
        }
        if (base) return `${base.replace(/\/$/, '')}/api/quiz`
        return ''
    }, [])

    const themeFromImageEndpoint = useMemo(() => {
        const directTheme = process.env.EXPO_PUBLIC_THEME_FROM_IMAGE_ENDPOINT
        if (directTheme) return directTheme
        const base = process.env.EXPO_PUBLIC_API_BASE_URL
        if (base) return `${base.replace(/\/$/, '')}/api/theme-from-image`
        if (!endpoint) return ''
        return endpoint.replace(/\/api\/quiz$/, '/api/theme-from-image')
    }, [endpoint])

    const [photoThemeLoading, setPhotoThemeLoading] = useState(false)
    // 範囲選択（切り取り）モーダル
    const [showCropModal, setShowCropModal] = useState(false)
    const [cropImageUri, setCropImageUri] = useState<string | null>(null)
    const [cropImageWidth, setCropImageWidth] = useState(0)
    const [cropImageHeight, setCropImageHeight] = useState(0)
    const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 })
    const [cropContainerLayout, setCropContainerLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
    /** 範囲選択画面で「再撮影」時に同じソース（カメラ/ライブラリ）を開く用 */
    const [cropPhotoSource, setCropPhotoSource] = useState<'camera' | 'library' | null>(null)
    const cropDragRef = useRef<{ handle: CropHandle; start: CropRect; lastX: number; lastY: number; totalDx: number; totalDy: number }>({
        handle: null, start: { x: 0, y: 0, width: 1, height: 1 }, lastX: 0, lastY: 0, totalDx: 0, totalDy: 0,
    })
    const cropRectRef = useRef<CropRect>(cropRect)
    const cropLayoutRef = useRef(cropContainerLayout)
    const cropImgSizeRef = useRef({ w: cropImageWidth, h: cropImageHeight })
    cropRectRef.current = cropRect
    cropLayoutRef.current = cropContainerLayout
    cropImgSizeRef.current = { w: cropImageWidth, h: cropImageHeight }

    const getCropDisplayRect = (): { offsetX: number; offsetY: number; displayW: number; displayH: number } => {
        const { width: cw, height: ch } = cropLayoutRef.current
        const { w: iw, h: ih } = cropImgSizeRef.current
        if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) return { offsetX: 0, offsetY: 0, displayW: 0, displayH: 0 }
        const scale = Math.min(cw / iw, ch / ih)
        const displayW = iw * scale
        const displayH = ih * scale
        return {
            offsetX: (cw - displayW) / 2,
            offsetY: (ch - displayH) / 2,
            displayW,
            displayH,
        }
    }

    const clampCropRect = (r: CropRect): CropRect => {
        let { x, y, width, height } = r
        if (width < CROP_MIN_REL) width = CROP_MIN_REL
        if (height < CROP_MIN_REL) height = CROP_MIN_REL
        if (x < 0) { width += x; x = 0 }
        if (y < 0) { height += y; y = 0 }
        if (x + width > 1) width = 1 - x
        if (y + height > 1) height = 1 - y
        if (width < CROP_MIN_REL || height < CROP_MIN_REL) return cropRectRef.current
        return { x, y, width, height }
    }

    const applyCropDrag = (start: CropRect, handle: CropHandle, dXRel: number, dYRel: number): CropRect => {
        if (!handle || handle === 'center') {
            let x = start.x + dXRel
            let y = start.y + dYRel
            if (x < 0) x = 0
            if (y < 0) y = 0
            if (x + start.width > 1) x = 1 - start.width
            if (y + start.height > 1) y = 1 - start.height
            return { ...start, x, y }
        }
        let { x, y, width, height } = start
        if (handle === 'topLeft') {
            x += dXRel
            y += dYRel
            width -= dXRel
            height -= dYRel
        } else if (handle === 'topRight') {
            y += dYRel
            width += dXRel
            height -= dYRel
        } else if (handle === 'bottomLeft') {
            x += dXRel
            width -= dXRel
            height += dYRel
        } else if (handle === 'bottomRight') {
            width += dXRel
            height += dYRel
        } else if (handle === 'left') {
            x += dXRel
            width -= dXRel
        } else if (handle === 'right') {
            width += dXRel
        } else if (handle === 'top') {
            y += dYRel
            height -= dYRel
        } else if (handle === 'bottom') {
            height += dYRel
        }
        return clampCropRect({ x, y, width, height })
    }

    const hitTestCropHandle = (px: number, py: number): CropHandle => {
        const { offsetX, offsetY, displayW, displayH } = getCropDisplayRect()
        const r = cropRectRef.current
        const left = offsetX + r.x * displayW
        const top = offsetY + r.y * displayH
        const right = left + r.width * displayW
        const bottom = top + r.height * displayH
        const inLeft = px >= left - CROP_EDGE_HIT && px <= left + CROP_HANDLE_SIZE
        const inRight = px >= right - CROP_HANDLE_SIZE && px <= right + CROP_EDGE_HIT
        const inTop = py >= top - CROP_EDGE_HIT && py <= top + CROP_HANDLE_SIZE
        const inBottom = py >= bottom - CROP_HANDLE_SIZE && py <= bottom + CROP_EDGE_HIT
        if (inLeft && inTop) return 'topLeft'
        if (inRight && inTop) return 'topRight'
        if (inLeft && inBottom) return 'bottomLeft'
        if (inRight && inBottom) return 'bottomRight'
        if (inLeft && py >= top && py <= bottom) return 'left'
        if (inRight && py >= top && py <= bottom) return 'right'
        if (inTop && px >= left && px <= right) return 'top'
        if (inBottom && px >= left && px <= right) return 'bottom'
        if (px >= left && px <= right && py >= top && py <= bottom) return 'center'
        return null
    }

    const cropPanResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
            const { locationX, locationY } = evt.nativeEvent
            const handle = hitTestCropHandle(locationX, locationY)
            cropDragRef.current = {
                handle,
                start: { ...cropRectRef.current },
                lastX: evt.nativeEvent.pageX,
                lastY: evt.nativeEvent.pageY,
                totalDx: 0,
                totalDy: 0,
            }
        },
        onPanResponderMove: (evt) => {
            const ref = cropDragRef.current
            if (ref.handle == null) return
            const { offsetX, offsetY, displayW, displayH } = getCropDisplayRect()
            if (displayW <= 0 || displayH <= 0) return
            const pageX = evt.nativeEvent.pageX
            const pageY = evt.nativeEvent.pageY
            ref.totalDx += pageX - ref.lastX
            ref.totalDy += pageY - ref.lastY
            ref.lastX = pageX
            ref.lastY = pageY
            const dXRel = ref.totalDx / displayW
            const dYRel = ref.totalDy / displayH
            const next = applyCropDrag(ref.start, ref.handle, dXRel, dYRel)
            setCropRect(next)
        },
        onPanResponderRelease: () => {},
    }), [])

    const loadTasks = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('review_tasks')
            .select('id, due_at, status, study_log_id, review_material_id, study_logs(note, subject, started_at, reference_book_id), review_materials(content, subject, reference_book_id, created_at, sm2_interval, sm2_ease_factor, sm2_repetitions)')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .lte('due_at', new Date().toISOString())
            .order('due_at', { ascending: true })

        if (!error) {
            const normalized = ((data as any[]) || []).map((task) => {
                const sl = Array.isArray(task.study_logs) ? task.study_logs[0] ?? null : task.study_logs ?? null
                const rm = Array.isArray(task.review_materials) ? task.review_materials[0] ?? null : task.review_materials ?? null

                const effectiveLog = rm ? {
                    note: rm.content,
                    subject: rm.subject,
                    reference_book_id: rm.reference_book_id,
                    started_at: rm.created_at
                } : sl

                return {
                    ...task,
                    study_logs: effectiveLog,
                    review_materials: rm,
                }
            })
            setReviewTasks(normalized as ReviewTask[])
        }

        // Load books here too so we have images immediately
        const { data: booksData, error: booksError } = await supabase
            .from('reference_books')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        if (!booksError) {
            setReferenceBooks((booksData || []) as ReferenceBook[])
        }

        setLoading(false)
    }

    useEffect(() => {
        loadTasks()
    }, [userId])


    // Extracted loadBooks function for reusability
    const loadBooks = async () => {
        const { data, error } = await supabase
            .from('reference_books')
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
        if (!error) {
            setReferenceBooks((data || []) as ReferenceBook[])
        }
    }

    // Load reference books when modal opens
    useEffect(() => {
        if (showCreateModal) {
            loadBooks()
        }

    }, [showCreateModal, userId])

    const handlePhotoToThemes = async (useCamera: boolean) => {
        if (!themeFromImageEndpoint) {
            Alert.alert('設定エラー', 'APIのURLが設定されていません。')
            return
        }
        const permission = useCamera
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (permission.status !== 'granted') {
            Alert.alert('権限が必要です', useCamera ? 'カメラの許可をしてください。' : '写真へのアクセスを許可してください。')
            return
        }
        const launch = useCamera
            ? () => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })
            : () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 })
        const result = await launch()
        if (result.canceled || !result.assets?.[0]?.uri) return
        const uri = result.assets[0].uri
        await new Promise<void>((resolve, reject) => {
            Image.getSize(uri, (w, h) => {
                setCropPhotoSource(useCamera ? 'camera' : 'library')
                setCropImageUri(uri)
                setCropImageWidth(w)
                setCropImageHeight(h)
                setCropRect({ x: 0, y: 0, width: 1, height: 1 })
                setShowCropModal(true)
                resolve()
            }, reject)
        }).catch(() => {
            Alert.alert('エラー', '画像の読み込みに失敗しました。')
        })
    }

    const submitCropAndExtractThemes = async () => {
        if (!cropImageUri || !themeFromImageEndpoint) return
        const { w: iw, h: ih } = cropImgSizeRef.current
        const originX = Math.round(cropRect.x * iw)
        const originY = Math.round(cropRect.y * ih)
        const width = Math.round(cropRect.width * iw)
        const height = Math.round(cropRect.height * ih)
        if (width <= 0 || height <= 0) {
            Alert.alert('エラー', '有効な範囲を選択してください。')
            return
        }
        setShowCropModal(false)
        setCropImageUri(null)
        setPhotoThemeLoading(true)
        try {
            const result = await imageManipulateAsync(
                cropImageUri,
                [{ crop: { originX, originY, width, height } }],
                { base64: true, format: ImageSaveFormat.JPEG, compress: 0.7 }
            )
            const base64 = result.base64
            if (!base64 || base64.length > 2_500_000) {
                Alert.alert('画像サイズが大きすぎます', '範囲を小さくして再度お試しください。')
                return
            }
            const res = await fetch(themeFromImageEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: base64,
                    mimeType: 'image/jpeg',
                }),
            })
            if (!res.ok) {
                const text = await res.text()
                let message = 'テーマの抽出に失敗しました'
                try {
                    const err = JSON.parse(text)
                    message = err.details || err.error || message
                } catch {
                    message = `${message} (HTTP ${res.status})`
                    if (text) message += `: ${text.slice(0, 120)}`
                }
                throw new Error(`${message}\nURL: ${themeFromImageEndpoint}`)
            }
            const data = await res.json()
            const themes: string[] = Array.isArray(data.themes) ? data.themes : []
            const slots = themes.slice(0, 5).map((t) => (typeof t === 'string' ? t.trim() : '').replace(/^[-*・]\s*/, ''))
            while (slots.length < 5) slots.push('')
            setAiNotes(slots)
            setCreateMode('ai')
            Alert.alert('完了', `${themes.length}件のテーマを抽出しました。内容を確認してから「作成」を押してください。`)
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'テーマの抽出に失敗しました'
            Alert.alert('エラー', msg)
        } finally {
            setPhotoThemeLoading(false)
        }
    }

    const pickBookImage = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (permission.status !== 'granted') {
            Alert.alert('権限が必要です', '写真へのアクセスを許可してください。')
            return
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true, // Forces JPEG/PNG conversation
            quality: 0.8,
        })
        if (!result.canceled && result.assets[0]?.uri) {
            setNewBookImage(result.assets[0].uri)
        }
    }

    const handleAddBook = async () => {
        if (!newBookName.trim()) return
        let imageUrl: string | null = null

        // Only upload if newBookImage is a local URI (starts with file:// or content://)
        // If it's already a http URL, keep it as is unless replaced
        const isLocalImage = newBookImage && !newBookImage.startsWith('http')

        if (isLocalImage && newBookImage) {
            try {
                const response = await fetch(newBookImage)
                const arrayBuffer = await response.arrayBuffer()
                const filePath = `${userId}/${Date.now()}.jpg`
                const { error: uploadError } = await supabase.storage
                    .from('reference-books')
                    .upload(filePath, arrayBuffer, {
                        contentType: 'image/jpeg',
                        cacheControl: '3600',
                        upsert: false
                    })
                if (!uploadError) {
                    const { data } = supabase.storage.from('reference-books').getPublicUrl(filePath)
                    imageUrl = data.publicUrl
                }
            } catch (_error) {
                Alert.alert('画像のアップロードに失敗しました', '画像なしで保存します。')
            }
        } else if (newBookImage && newBookImage.startsWith('http')) {
            imageUrl = newBookImage
        }

        if (editingBookId) {
            // Update existing book
            const { error, data } = await supabase
                .from('reference_books')
                .update({
                    name: newBookName.trim(),
                    image_url: imageUrl,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingBookId)
                .select()
                .single()

            if (error) {
                Alert.alert('保存エラー', error.message)
                return
            }

            setReferenceBooks((prev) => prev.map(b => b.id === editingBookId ? (data as ReferenceBook) : b))
            setEditingBookId(null)
        } else {
            const { data: deletedBook } = await supabase
                .from('reference_books')
                .select('*')
                .eq('user_id', userId)
                .eq('name', newBookName.trim())
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (deletedBook) {
                const { error } = await supabase
                    .from('reference_books')
                    .update({
                        deleted_at: null,
                        image_url: imageUrl || deletedBook.image_url,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', deletedBook.id)
                if (error) {
                    Alert.alert('保存エラー', error.message)
                    return
                }
                const restored = {
                    ...(deletedBook as ReferenceBook),
                    deleted_at: null,
                    image_url: imageUrl || deletedBook.image_url,
                }
                setReferenceBooks((prev) => [restored, ...prev])
                setSelectedBookId(restored.id)
            } else {
                const { error, data } = await supabase
                    .from('reference_books')
                    .insert({
                        user_id: userId,
                        name: newBookName.trim(),
                        image_url: imageUrl,
                        type: 'book',
                    })
                    .select()
                    .single()
                if (error) {
                    Alert.alert('保存エラー', error.message)
                    return
                }
                setReferenceBooks((prev) => [data as ReferenceBook, ...prev])
                setSelectedBookId(data.id)
            }
        }
        setNewBookName('')
        setNewBookImage(null)
        setShowAddBookForm(false)
        await loadBooks() // Reload books to reflect the saved image
        // setShowBookPicker(false) // Keep open to verify or continue? Previously it closed. Let's keep it consistent with previous logic if it wasn't editing.
        // Actually, if editing, we probably want to stay in picker. If creating, maybe close?
        // Let's close unless we want to allow multiple edits. The user asked for ability to change logic.
        // For now, let's close it as the original code did, but maybe not if editing? 
        // Original code: setShowBookPicker(false)
        setShowBookPicker(false)
    }

    const handleDeleteBook = async (bookId: string) => {
        Alert.alert(
            '教材の削除',
            'この教材を削除してもよろしいですか？\n削除すると復元できません。',
            [
                {
                    text: 'キャンセル',
                    style: 'cancel',
                },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase
                            .from('reference_books')
                            .update({ deleted_at: new Date().toISOString() })
                            .eq('id', bookId)
                        if (error) {
                            Alert.alert('削除エラー', error.message)
                            return
                        }
                        setReferenceBooks((prev) => prev.filter((book) => book.id !== bookId))
                        if (selectedBookId === bookId) setSelectedBookId(null)
                        if (editingBookId === bookId) {
                            setEditingBookId(null)
                            setShowAddBookForm(false)
                            setNewBookName('')
                            setNewBookImage(null)
                        }
                    },
                },
            ]
        )
    }

    const splitThemes = (text: string) => {
        return text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => line.replace(/^[-*•・]\s*/, '').trim())
            .filter(Boolean)
    }

    const getThemeKey = (taskId: string, theme: string) => `${taskId}::${theme}`

    const formatReviewDate = (dateString?: string | null) => {
        if (!dateString) return ''
        const studyDay = getStudyDay(new Date(dateString))
        const studyDate = getStudyDayDate(studyDay)
        const today = getStudyDayDate(getStudyDay(new Date()))
        const diffDays = Math.max(0, Math.round((today.getTime() - studyDate.getTime()) / 86400000))
        return `${formatDateLabel(studyDate)}(${diffDays}日前)`
    }

    const parseFlashcard = (text: string): { question: string; answer: string | null } => {
        const parts = text.split(' : ')
        if (parts.length === 2) {
            return { question: parts[0].trim(), answer: parts[1].trim() }
        }
        return { question: text, answer: null }
    }

    const handleFlashcardReview = (taskId: string, theme: string) => {
        const key = getThemeKey(taskId, theme)
        setFlashcardMode((prev) => ({ ...prev, [key]: true }))
    }

    const handleShowAnswer = (taskId: string, theme: string) => {
        const key = getThemeKey(taskId, theme)
        setShowingAnswer((prev) => ({ ...prev, [key]: true }))
    }

    /**
     * SM-2: 1テーマずつ評価を記録。そのタスクの全テーマが終わったときだけDB更新・タスク削除する。
     */
    const handleSM2Rating = async (taskId: string, theme: string, rating: SM2Rating) => {
        const task = reviewTasks.find((t) => t.id === taskId)
        if (!task) return

        const noteContent = task.review_materials?.content || task.study_logs?.note || ''
        const allThemes = splitThemes(noteContent)
        const themes = allThemes.length > 0 ? allThemes : ['全体復習']

        // このテーマの評価を記録し、このテーマを「このタスク内で完了」に追加
        setThemeRatingsInTask((prev) => ({ ...prev, [getThemeKey(taskId, theme)]: rating }))
        setCompletedThemesInTask((prev) => ({
            ...prev,
            [taskId]: [...(prev[taskId] || []).filter((t) => t !== theme), theme],
        }))

        // 表示上はすぐ非表示にするため、completedThemesInTask でフィルタしているのでここで return すると
        // まだ他テーマが残っているかどうかは state 更新後なので判定できない。次のレンダーで判定される。
        // 全テーマ完了時だけ DB 更新したいので、同期的に「今の completed にこの theme を足した集合」で判定する。
        const completedNow = [...(completedThemesInTask[taskId] || []).filter((t) => t !== theme), theme]
        const allCompleted = themes.every((t) => completedNow.includes(t))

        if (!allCompleted) {
            return
        }

        // 全テーマ完了: 一番厳しい評価で SM-2 を更新（苦手 > うろ覚え > 完璧）
        const ratings = themes.map((t) => (t === theme ? rating : themeRatingsInTask[getThemeKey(taskId, t)] ?? 'perfect'))
        const worstRating: SM2Rating = ratings.some((r) => r === 'hard') ? 'hard' : ratings.some((r) => r === 'good') ? 'good' : 'perfect'

        const rm = task.review_materials as any
        const materialId = task.review_material_id
        const currentState = {
            interval: rm?.sm2_interval ?? 0,
            easeFactor: rm?.sm2_ease_factor ?? 2.5,
            repetitions: rm?.sm2_repetitions ?? 0,
        }
        const result = calculateSM2(worstRating, currentState)
        const nextDueDate = getNextDueDate(result.nextDueDays)

        await supabase.from('review_tasks').update({ status: 'completed' }).eq('id', taskId)
        if (materialId) {
            await supabase.from('review_materials').update({
                sm2_interval: result.interval,
                sm2_ease_factor: result.easeFactor,
                sm2_repetitions: result.repetitions,
            }).eq('id', materialId)
            await supabase.from('review_tasks')
                .delete()
                .eq('review_material_id', materialId)
                .eq('status', 'pending')
                .gt('due_at', new Date().toISOString())
            await supabase.from('review_tasks').insert({
                user_id: userId,
                review_material_id: materialId,
                due_at: nextDueDate.toISOString(),
                status: 'pending',
            })
        }

        setCompletedThemesInTask((prev) => { const next = { ...prev }; delete next[taskId]; return next })
        setThemeRatingsInTask((prev) => {
            const next = { ...prev }
            themes.forEach((t) => delete next[getThemeKey(taskId, t)])
            return next
        })
        setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
    }





    // Note: handleQuizComplete is deprecated in favor of inline logic in the render block
    // which immediately shows SM2 rating buttons or a "continue" button without needing a "終了" step.

    const handleGenerateQuiz = async (task: ReviewTask, theme?: string): Promise<boolean> => {
        if (!endpoint) {
            Alert.alert('設定エラー', 'APIエンドポイントが設定されていません。アプリを再起動してみてください。')
            return false
        }
        const noteValue = (task.review_materials?.content || task.study_logs?.note || '').trim()
        if (!noteValue) {
            Alert.alert('データエラー', '学習内容（メモ）が記録されていないため、クイズを生成できません。')
            return false
        }
        const themeValue = theme || noteValue
        const difficultyKey = getThemeKey(task.id, themeValue)
        const difficulty = difficultyByTheme[difficultyKey] || DEFAULT_DIFFICULTY
        setQuizByTask((prev) => {
            const current = prev[task.id]?.themes || {}
            const existing = current[themeValue]
            return {
                ...prev,
                [task.id]: {
                    themes: {
                        ...current,
                        [themeValue]: {
                            loading: true,
                            questions: existing?.questions || [],
                            answers: existing?.answers || {},
                        },
                    },
                },
            }
        })
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 90000)
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: themeValue, count: 1, difficulty }),
                signal: controller.signal,
            })
            clearTimeout(timeoutId)
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const errorMessage = errorData.details || errorData.error || 'クイズの生成に失敗しました'
                throw new Error(errorMessage)
            }
            const data = await response.json()

            // Calculate and log usage if provided by the API
            if (data.usage) {
                console.log('--- OpenAI API Usage (gpt-5-mini) ---')
                console.log(`Input Tokens:  ${data.usage.inputTokens} ($${data.usage.inputCostUSD.toFixed(6)})`)
                console.log(`Output Tokens: ${data.usage.outputTokens} ($${data.usage.outputCostUSD.toFixed(6)})`)
                console.log(`Total Tokens:  ${data.usage.totalTokens}`)
                console.log(`Total Cost:    $${data.usage.totalCostUSD.toFixed(6)} (約 ${data.usage.totalCostJPY.toFixed(4)} 円)`)
                console.log('---------------------------------------')
            }

            const questions = (data.questions || []).map((q: QuizQuestion) => {
                const originalChoices = q.choices ? q.choices.map((c: any) => String(c)) : []
                const correctIndex = Number(q.correct_index ?? 0)

                // Create an array of indices [0, 1, 2, 3] and shuffle them
                const indices = Array.from({ length: originalChoices.length }, (_, i) => i)
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]]
                }

                // Reorder choices based on shuffled indices
                const shuffledChoices = indices.map((i) => originalChoices[i])

                // Find where the original correct answer moved to
                const newCorrectIndex = indices.indexOf(correctIndex)

                return {
                    ...q,
                    choices: shuffledChoices,
                    correct_index: newCorrectIndex,
                    theme: themeValue,
                }
            })
            setQuizByTask((prev) => {
                const current = prev[task.id]?.themes || {}
                const existing = current[themeValue]
                return {
                    ...prev,
                    [task.id]: {
                        themes: {
                            ...current,
                            [themeValue]: {
                                loading: false,
                                questions,
                                answers: existing?.answers || {},
                            },
                        },
                    },
                }
            })
            return true
        } catch (error) {
            clearTimeout(timeoutId)
            setQuizByTask((prev) => {
                const next = { ...prev }
                const current = next[task.id]?.themes
                if (current?.[themeValue]) {
                    next[task.id] = {
                        themes: {
                            ...current,
                            [themeValue]: { ...current[themeValue], loading: false },
                        },
                    }
                } else {
                    delete next[task.id]
                }
                return next
            })
            const message = error instanceof Error ? error.message : 'クイズの生成に失敗しました。'
            if ((error as Error)?.name === 'AbortError') {
                Alert.alert('タイムアウト', 'クイズ生成が90秒でタイムアウトしました。通信環境を確認して再試行してください。')
            } else {
                Alert.alert('生成エラー', message)
            }
            return false
        }
    }


    const handleAnswer = async (taskId: string, theme: string, qIndex: number, choiceIndex: number) => {
        const quiz = quizByTask[taskId]
        const themeQuiz = quiz?.themes[theme]
        if (!themeQuiz || themeQuiz.loading) return
        if (themeQuiz.answers[qIndex] !== undefined) return

        const question = themeQuiz.questions[qIndex]
        if (!question) return

        // choiceIndex === -1 は「わからない」ボタン → 必ず不正解扱い
        const isCorrect = choiceIndex !== -1 && choiceIndex === question.correct_index
        await supabase.from('quiz_attempts').insert({
            user_id: userId,
            review_task_id: taskId,
            question: question.question,
            choices: question.choices,
            correct_index: question.correct_index,
            selected_index: choiceIndex,
            is_correct: isCorrect,
        })

        const nextAnswers = { ...themeQuiz.answers, [qIndex]: choiceIndex }
        const nextThemes = { ...(quiz?.themes || {}), [theme]: { ...themeQuiz, answers: nextAnswers } }
        setQuizByTask((prev) => ({ ...prev, [taskId]: { themes: nextThemes } }))


    }

    const handleSkipTask = async (taskId: string) => {
        await supabase.from('review_tasks').update({ status: 'skipped' }).eq('id', taskId)
        setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
    }

    const handleSkipTheme = (taskId: string, theme: string, remaining: string[]) => {
        setSkippedThemes((prev) => {
            const current = prev[taskId] || []
            if (current.includes(theme)) return prev
            return { ...prev, [taskId]: [...current, theme] }
        })
        setQuizByTask((prev) => {
            const current = prev[taskId]
            if (!current) return prev
            const nextThemes = { ...current.themes }
            delete nextThemes[theme]
            return { ...prev, [taskId]: { themes: nextThemes } }
        })
        const nextRemaining = remaining.filter((t) => t !== theme)
        if (nextRemaining.length === 0) handleSkipTask(taskId)
    }

    const handleEditTheme = async (task: ReviewTask, oldTheme: string, newTheme: string) => {
        const trimmed = newTheme.trim()
        if (!trimmed) return
        setEditingThemeKey(null)
        setEditingThemeText('')

        const materialId = task.review_material_id
        if (materialId) {
            // 現在のcontentの中で该当テーマ行を新テーマに置き換える
            const currentContent = task.review_materials?.content || task.study_logs?.note || ''
            const lines = currentContent.split('\n').map((line: string) => {
                const cleaned = line.trim().replace(/^[-*•・]\s*/, '').trim()
                if (cleaned === oldTheme.trim()) {
                    // 元の行頭文字を保持しながら置き換える
                    const prefix = line.match(/^(\s*[-*•・]\s*)/)?.[1] || '・'
                    return `${prefix}${trimmed}`
                }
                return line
            })
            const newContent = lines.join('\n')

            const { error } = await supabase
                .from('review_materials')
                .update({ content: newContent })
                .eq('id', materialId)
            if (error) {
                Alert.alert('保存エラー', error.message)
                return
            }
            // ローカルのreviewTasksも更新する
            setReviewTasks((prev) =>
                prev.map((t) => {
                    if (t.id !== task.id) return t
                    return {
                        ...t,
                        study_logs: { ...t.study_logs, note: newContent } as ReviewTask['study_logs'],
                        review_materials: t.review_materials ? { ...t.review_materials, content: newContent } : t.review_materials,
                    }
                }) as ReviewTask[]
            )
        }

        // 旧テーマのクイズステートを削除して再生成
        const fakeTask = {
            ...task,
            study_logs: task.study_logs ? { ...task.study_logs, note: task.review_materials?.content || task.study_logs?.note || '' } : task.study_logs,
            review_materials: task.review_materials ? {
                ...task.review_materials, content: (task.review_materials?.content || '').split('\n').map((line: string) => {
                    const cleaned = line.trim().replace(/^[-*•・]\s*/, '').trim()
                    if (cleaned === oldTheme.trim()) {
                        const prefix = line.match(/^(\s*[-*•・]\s*)/)?.[1] || '・'
                        return `${prefix}${trimmed}`
                    }
                    return line
                }).join('\n')
            } : task.review_materials,
        }

        setQuizByTask((prev) => {
            const current = prev[task.id]
            if (!current) return prev
            const nextThemes = { ...current.themes }
            delete nextThemes[oldTheme]
            return { ...prev, [task.id]: { themes: nextThemes } }
        })

        await handleGenerateQuiz(fakeTask, trimmed)
    }

    const handleCreate = async () => {
        if (!selectedBookId) {
            Alert.alert('エラー', '教材を選択してください')
            return
        }

        const selectedBook = referenceBooks.find((b) => b.id === selectedBookId)
        const subject = selectedBook ? selectedBook.name : 'その他'

        let noteValue = ''
        if (createMode === 'ai') {
            const validNotes = aiNotes.filter((n) => n.trim())
            if (validNotes.length === 0) {
                Alert.alert('エラー', '最低1つのメモを入力してください')
                return
            }
            noteValue = validNotes.map((n) => `・${n.trim()}`).join('\n')
        } else {
            const validCards = flashcards.filter((c) => c.question.trim() && c.answer.trim())
            if (validCards.length === 0) {
                Alert.alert('エラー', '最低1枚のカードを作成してください')
                return
            }
            noteValue = validCards.map((c) => `${c.question.trim()} : ${c.answer.trim()}`).join('\n')
        }

        setLoading(true)

        // Use app's date logic
        const year = selectedDate.getFullYear()
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
        const day = String(selectedDate.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        const studyDayDate = getStudyDayDate(dateStr)
        const startedAtIso = new Date(studyDayDate.getTime() + 9 * 60 * 60 * 1000).toISOString()

        const { data, error } = await supabase
            .from('review_materials')
            .insert({
                user_id: userId,
                subject: subject,
                content: noteValue,
                reference_book_id: selectedBookId || null,
            })
            .select()
            .single()

        if (error) {
            Alert.alert('保存エラー', error.message)
            setLoading(false)
            return
        }

        if (data?.id) {
            // 選択した学習日の「翌日」を初回復習日にする（昨日で登録→今日から解ける）
            const firstDueDate = new Date(studyDayDate.getTime() + 24 * 60 * 60 * 1000)
            const { error: taskError } = await supabase.from('review_tasks').insert({
                user_id: userId,
                review_material_id: data.id,
                due_at: firstDueDate.toISOString(),
                status: 'pending',
            })
            if (taskError) {
                console.error(taskError)
                Alert.alert('タスク作成エラー', 'タスク作成に失敗しました')
            }
        }


        setSelectedDate(new Date())
        setAiNotes([''])
        setFlashcards([{ question: '', answer: '' }])
        setShowCreateModal(false)
        setCreateMode('ai')
        loadTasks()
        Alert.alert('成功', '復習カードを作成しました！')
    }

    // DEBUG: Log tasks and groups
    useEffect(() => {
        if (reviewTasks.length > 0) {
            // console.log(`[ReviewScreen] Loaded ${reviewTasks.length} tasks`)
            reviewTasks.forEach(t => {
                const noteLen = t.study_logs?.note?.length || 0
                const bookId = t.study_logs?.reference_book_id
                // console.log(`- Task ${t.id}: Book=${bookId}, NoteLen=${noteLen}`)
            })
        }
    }, [reviewTasks])

    const groupedTasks = useMemo(() => {
        const groups: Record<string, {
            key: string
            title: string
            imageUrl: string | null
            tasks: ReviewTask[]
            themeCount: number
        }> = {}

        // 1. Initialize with all reference books
        referenceBooks.forEach((book) => {
            const key = `book:${book.id}`
            groups[key] = {
                key,
                title: book.name,
                imageUrl: book.image_url,
                tasks: [],
                themeCount: 0,
            }
        })

        // 2. Distribute tasks
        reviewTasks.forEach((task) => {
            const bookId = task.study_logs?.reference_book_id
            const subject = task.study_logs?.subject || 'その他'
            // If bookId exists, group by bookId. Otherwise group by subject name.
            const key = bookId ? `book:${bookId}` : `subject:${subject}`

            if (!groups[key]) {
                let title = subject
                let imageUrl: string | null = null

                if (bookId) {
                    const book = referenceBooks.find((b) => b.id === bookId)
                    if (book) {
                        title = book.name
                        imageUrl = book.image_url
                    }
                }

                groups[key] = {
                    key,
                    title,
                    imageUrl,
                    tasks: [],
                    themeCount: 0,
                }
            }
            groups[key].tasks.push(task)

            // Calculate theme count for this task
            let themes = splitThemes(task.study_logs?.note || '')
            if (themes.length === 0) {
                themes = ['全体復習']
            }
            // Exclude already skipped themes
            const visibleThemes = themes.filter((theme) => !(skippedThemes[task.id] || []).includes(theme) && !(completedThemesInTask[task.id] || []).includes(theme))
            groups[key].themeCount += visibleThemes.length
        })

        return Object.values(groups).sort((a, b) => {
            // Sort by task count desc, then title
            // if (b.tasks.length !== a.tasks.length) return b.tasks.length - a.tasks.length
            return a.title.localeCompare(b.title)
        })
    }, [reviewTasks, referenceBooks, skippedThemes, completedThemesInTask])

    // DEBUG: Log groups
    useEffect(() => {
        if (groupedTasks.length > 0) {
            // console.log(`[ReviewScreen] Grouped into ${groupedTasks.length} groups`)
            groupedTasks.forEach(g => {
                // console.log(`- Group ${g.key}: ${g.title}, ${g.tasks.length} tasks`)
            })
        }
    }, [groupedTasks])

    const currentTasks = useMemo(() => {
        if (!selectedSubjectKey) return []
        const group = groupedTasks.find(g => g.key === selectedSubjectKey)
        return group ? group.tasks : []
    }, [selectedSubjectKey, groupedTasks])


    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.cardTitle}>復習カード</Text>
                        <Text style={styles.cardSubtitle}>
                            {(selectedSubjectKey)
                                ? (selectedSubjectKey ? groupedTasks.find(g => g.key === selectedSubjectKey)?.title : groupedTasks[0]?.title)
                                : '忘却曲線に合わせて今日の復習を出題します'}
                        </Text>
                    </View>
                    {(selectedSubjectKey) ? (
                        <Pressable style={styles.backButton} onPress={() => setSelectedSubjectKey(null)}>
                            <Text style={styles.backButtonText}>戻る</Text>
                        </Pressable>
                    ) : (
                        <Pressable style={styles.createButton} onPress={() => setShowCreateModal(true)}>
                            <Ionicons name="add-circle" size={20} color="#ffffff" />
                            <Text style={styles.createButtonText}>作成</Text>
                        </Pressable>
                    )}
                </View>
                {(loading || (groupedTasks.length === 0 && !loading)) ? (
                    <>
                        {loading && <Text style={styles.mutedText}>読み込み中...</Text>}
                        {!loading && groupedTasks.length === 0 && (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconContainer}>
                                    <Ionicons name="checkmark-done-circle" size={64} color="#3b82f6" />
                                </View>
                                <Text style={styles.emptyTitle}>すべて完了！</Text>
                                <Text style={styles.emptySubtitle}>
                                    今日の復習タスクはありません{'\n'}
                                    新しいカードを作成して学習を始めましょう
                                </Text>
                                <Pressable
                                    style={styles.emptyActionButton}
                                    onPress={() => setShowCreateModal(true)}
                                >
                                    <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
                                    <Text style={styles.emptyActionText}>カードを作成</Text>
                                </Pressable>
                            </View>
                        )}
                    </>
                ) : (
                    <>
                        {!selectedSubjectKey ? (
                            <View style={styles.subjectList}>
                                {groupedTasks.map((group) => (
                                    <Pressable
                                        key={group.key}
                                        style={styles.subjectCard}
                                        onPress={() => setSelectedSubjectKey(group.key)}
                                    >
                                        <View style={styles.subjectCardLeft}>
                                            <View style={styles.subjectIconBox}>
                                                {group.imageUrl ? (
                                                    <Image source={{ uri: group.imageUrl }} style={styles.subjectImage} />
                                                ) : (
                                                    <Ionicons name="book" size={24} color="#64748b" />
                                                )}
                                            </View>
                                            <View>
                                                <Text style={styles.subjectTitle}>{group.title}</Text>
                                                <View style={styles.badgeRow}>
                                                    <View style={styles.cnadge}>
                                                        <Text style={styles.cnadgeText}>{group.themeCount}件の復習</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                                    </Pressable>
                                ))}
                            </View>
                        ) : (
                            <View>

                                {currentTasks.map((task) => {
                                    const quiz = quizByTask[task.id]
                                    let themes = splitThemes(task.study_logs?.note || '')
                                    if (themes.length === 0) {
                                        themes = ['全体復習']
                                    }
                                    const visibleThemes = themes.filter((theme) => !(skippedThemes[task.id] || []).includes(theme) && !(completedThemesInTask[task.id] || []).includes(theme))

                                    if (visibleThemes.length === 0) return null

                                    return (
                                        <View key={task.id} style={styles.taskCard}>
                                            {visibleThemes.map((theme, index) => {
                                                const themeQuiz = quiz?.themes?.[theme]
                                                const themeKey = getThemeKey(task.id, theme)
                                                const selectedDifficulty = difficultyByTheme[themeKey] || DEFAULT_DIFFICULTY
                                                return (
                                                    <View key={`${task.id}-${index}`} style={styles.themeCard}>
                                                        <View style={styles.themeHeader}>
                                                            <Text style={styles.themeTitle}>{task.study_logs?.subject || '学習内容'}</Text>
                                                            <Text style={styles.mutedText}>{formatReviewDate(task.study_logs?.started_at)}</Text>
                                                        </View>
                                                        <Text style={styles.mutedText}>{theme}</Text>
                                                        <View style={styles.difficultyRow}>
                                                            <Text style={styles.difficultyLabel}>難易度</Text>
                                                            {[
                                                                { key: 'easy' as Difficulty, label: '易しい' },
                                                                { key: 'normal' as Difficulty, label: '普通' },
                                                                { key: 'hard' as Difficulty, label: '難しい' },
                                                            ].map((item) => (
                                                                <Pressable
                                                                    key={item.key}
                                                                    style={[
                                                                        styles.difficultyButton,
                                                                        selectedDifficulty === item.key && styles.difficultyButtonActive,
                                                                    ]}
                                                                    onPress={() =>
                                                                        setDifficultyByTheme((prev) => ({ ...prev, [themeKey]: item.key }))
                                                                    }
                                                                >
                                                                    <Text
                                                                        style={[
                                                                            styles.difficultyText,
                                                                            selectedDifficulty === item.key && styles.difficultyTextActive,
                                                                        ]}
                                                                    >
                                                                        {item.label}
                                                                    </Text>
                                                                </Pressable>
                                                            ))}
                                                        </View>

                                                        {!themeQuiz && !flashcardMode[themeKey] && (() => {
                                                            const flashcard = parseFlashcard(theme)
                                                            // フラッシュカードモード（答えあり）: フラッシュカードボタンのみ
                                                            if (flashcard.answer) {
                                                                return (
                                                                    <Pressable style={[styles.outlineButton, styles.flashcardButton]} onPress={() => handleFlashcardReview(task.id, theme)}>
                                                                        <Text style={[styles.outlineButtonText, styles.flashcardButtonText]}>フラッシュカードで復習</Text>
                                                                    </Pressable>
                                                                )
                                                            }
                                                            // AIモード（答えなし）: AIクイズボタンのみ
                                                            return (
                                                                <Pressable style={styles.outlineButton} onPress={() => handleGenerateQuiz(task, theme)}>
                                                                    <Text style={styles.outlineButtonText}>AIクイズを作成（1問）</Text>
                                                                </Pressable>
                                                            )
                                                        })()}
                                                        {flashcardMode[themeKey] && (() => {
                                                            const flashcard = parseFlashcard(theme)
                                                            const isShowing = showingAnswer[themeKey]
                                                            return (
                                                                <View style={styles.flashcardContainer}>
                                                                    <View style={styles.flashcardCard}>
                                                                        <Text style={styles.flashcardLabel}>問題</Text>
                                                                        <Text style={styles.flashcardQuestion}>{flashcard.question}</Text>
                                                                        {isShowing && (
                                                                            <>
                                                                                <Text style={[styles.flashcardLabel, styles.answerLabel]}>答え</Text>
                                                                                <Text style={styles.flashcardAnswer}>{flashcard.answer}</Text>
                                                                            </>
                                                                        )}
                                                                    </View>
                                                                    {!isShowing ? (
                                                                        <Pressable style={[styles.outlineButton, styles.showAnswerButton]} onPress={() => handleShowAnswer(task.id, theme)}>
                                                                            <Text style={styles.outlineButtonText}>答えを見る</Text>
                                                                        </Pressable>
                                                                    ) : (
                                                                        <View style={styles.flashcardActions}>
                                                                            <Pressable style={[styles.outlineButton, styles.perfectButton]} onPress={() => handleSM2Rating(task.id, theme, 'perfect')}>
                                                                                <Text style={[styles.outlineButtonText, styles.perfectButtonText]}>完璧 ⭐</Text>
                                                                            </Pressable>
                                                                            <Pressable style={[styles.outlineButton, styles.goodButton]} onPress={() => handleSM2Rating(task.id, theme, 'good')}>
                                                                                <Text style={[styles.outlineButtonText, styles.goodButtonText]}>うろ覚え 🤔</Text>
                                                                            </Pressable>
                                                                            <Pressable style={[styles.outlineButton, styles.hardButton]} onPress={() => handleSM2Rating(task.id, theme, 'hard')}>
                                                                                <Text style={[styles.outlineButtonText, styles.hardButtonText]}>苦手 😓</Text>
                                                                            </Pressable>
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            )
                                                        })()}
                                                        {themeQuiz?.loading && <Text style={styles.mutedText}>クイズ作成中...</Text>}
                                                        {themeQuiz?.questions?.length > 0 && (
                                                            <View style={styles.quizBlock}>
                                                                {themeQuiz.questions.map((q, qIndex) => {
                                                                    const answered = themeQuiz.answers[qIndex] !== undefined
                                                                    return (
                                                                        <View key={`${task.id}-${qIndex}`} style={styles.quizItem}>
                                                                            <Text style={styles.quizQuestion}>{qIndex + 1}. {q.question}</Text>
                                                                            {q.choices.map((choice, cIndex) => {
                                                                                const selected = themeQuiz.answers[qIndex] === cIndex
                                                                                const isCorrect = q.correct_index === cIndex
                                                                                return (
                                                                                    <Pressable
                                                                                        key={`${task.id}-${qIndex}-${cIndex}`}
                                                                                        onPress={() => handleAnswer(task.id, theme, qIndex, cIndex)}
                                                                                        disabled={answered}
                                                                                        style={[
                                                                                            styles.choiceButton,
                                                                                            selected && (isCorrect ? styles.choiceCorrect : styles.choiceWrong),
                                                                                        ]}
                                                                                    >
                                                                                        <Text style={styles.choiceText}>{choice}</Text>
                                                                                    </Pressable>
                                                                                )
                                                                            })}
                                                                            {!answered && (
                                                                                <>
                                                                                    <Pressable
                                                                                        style={[styles.outlineButton, styles.dontKnowButton]}
                                                                                        onPress={() => handleAnswer(task.id, theme, qIndex, -1)}
                                                                                    >
                                                                                        <Text style={[styles.outlineButtonText, styles.dontKnowButtonText]}>わからない 🤷</Text>
                                                                                    </Pressable>
                                                                                    {editingThemeKey === themeKey ? (
                                                                                        <View style={styles.editThemeContainer}>
                                                                                            <TextInput
                                                                                                style={styles.editThemeInput}
                                                                                                value={editingThemeText}
                                                                                                onChangeText={setEditingThemeText}
                                                                                                multiline
                                                                                                autoFocus
                                                                                                placeholder="テーマを編集してください"
                                                                                            />
                                                                                            <View style={styles.editThemeActions}>
                                                                                                <Pressable
                                                                                                    style={[styles.outlineButton, styles.editThemeCancelButton]}
                                                                                                    onPress={() => { setEditingThemeKey(null); setEditingThemeText('') }}
                                                                                                >
                                                                                                    <Text style={styles.outlineButtonText}>キャンセル</Text>
                                                                                                </Pressable>
                                                                                                <Pressable
                                                                                                    style={[styles.outlineButton, styles.editThemeSubmitButton]}
                                                                                                    onPress={() => handleEditTheme(task, theme, editingThemeText)}
                                                                                                >
                                                                                                    <Text style={[styles.outlineButtonText, styles.editThemeSubmitText]}>これで作り直す ✨</Text>
                                                                                                </Pressable>
                                                                                            </View>
                                                                                        </View>
                                                                                    ) : (
                                                                                        <Pressable
                                                                                            style={[styles.outlineButton, styles.editThemeButton]}
                                                                                            onPress={() => { setEditingThemeKey(themeKey); setEditingThemeText(theme) }}
                                                                                        >
                                                                                            <Text style={[styles.outlineButtonText, styles.editThemeButtonText]}>✏️ テーマを編集して作り直す</Text>
                                                                                        </Pressable>
                                                                                    )}
                                                                                </>
                                                                            )}

                                                                            {answered && (
                                                                                <View style={{ marginTop: 8 }}>
                                                                                    <Text style={styles.mutedText}>
                                                                                        正解: {q.correct_index + 1}番
                                                                                    </Text>
                                                                                    {q.explanation && (
                                                                                        <Text style={styles.explanationText}>
                                                                                            {q.explanation}
                                                                                        </Text>
                                                                                    )}
                                                                                    {(() => {
                                                                                        const isAllAnswered = themeQuiz.questions.every((_, i) => themeQuiz.answers[i] !== undefined)
                                                                                        if (!isAllAnswered) return null

                                                                                        const isIncorrect = themeQuiz.questions.some((quizQ, idx) => {
                                                                                            const ans = themeQuiz.answers[idx]
                                                                                            return ans !== undefined && ans !== quizQ.correct_index
                                                                                        })

                                                                                        if (isIncorrect) {
                                                                                            return (
                                                                                                <Pressable
                                                                                                    style={[styles.outlineButton, styles.hardButton, { marginTop: 12 }]}
                                                                                                    onPress={() => handleSM2Rating(task.id, theme, 'hard')}
                                                                                                >
                                                                                                    <Text style={[styles.outlineButtonText, styles.hardButtonText]}>次へ（不正解のため明日に再復習）</Text>
                                                                                                </Pressable>
                                                                                            )
                                                                                        } else {
                                                                                            return (
                                                                                                <View style={[styles.flashcardActions, { marginTop: 12 }]}>
                                                                                                    <Pressable
                                                                                                        style={[styles.outlineButton, styles.perfectButton, { flex: 1 }]}
                                                                                                        onPress={() => handleSM2Rating(task.id, theme, 'perfect')}
                                                                                                    >
                                                                                                        <Text style={[styles.outlineButtonText, styles.perfectButtonText]}>完璧 ⭐</Text>
                                                                                                    </Pressable>
                                                                                                    <Pressable
                                                                                                        style={[styles.outlineButton, styles.goodButton, { flex: 1 }]}
                                                                                                        onPress={() => handleSM2Rating(task.id, theme, 'good')}
                                                                                                    >
                                                                                                        <Text style={[styles.outlineButtonText, styles.goodButtonText]}>うろ覚え 🤔</Text>
                                                                                                    </Pressable>
                                                                                                </View>
                                                                                            )
                                                                                        }
                                                                                    })()}
                                                                                </View>
                                                                            )}
                                                                        </View>
                                                                    )
                                                                })}
                                                            </View>
                                                        )}
                                                    </View>
                                                )
                                            })}
                                        </View>
                                    )
                                })}
                                {currentTasks.every(t => {
                                    const themes = splitThemes(t.study_logs?.note || '')
                                    // Check if all themes for this task are skipped/hidden
                                    const visible = themes.filter((theme) => !(skippedThemes[t.id] || []).includes(theme) && !(completedThemesInTask[t.id] || []).includes(theme))
                                    return visible.length === 0
                                }) && (
                                        <View style={[styles.emptyState, { marginTop: 40, backgroundColor: 'transparent' }]}>
                                            <View style={styles.emptyIconContainer}>
                                                <Ionicons name="trophy" size={56} color="#fbbf24" />
                                            </View>
                                            <Text style={styles.emptyTitle}>復習コンプリート！</Text>
                                            <Text style={[styles.emptySubtitle, { color: '#64748b', marginBottom: 30 }]}>
                                                この教材の復習はすべて完了しました！{'\n'}
                                                素晴らしい進捗です。
                                            </Text>
                                            <Pressable style={styles.emptyActionButton} onPress={() => setSelectedSubjectKey(null)}>
                                                <Ionicons name="list" size={20} color="#ffffff" />
                                                <Text style={styles.emptyActionText}>一覧に戻る</Text>
                                            </Pressable>
                                        </View>
                                    )}
                            </View>
                        )}
                    </>
                )}
            </View>

            {/* 写真の範囲選択（切り取り）モーダル */}
            <Modal
                visible={showCropModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => { setShowCropModal(false); setCropImageUri(null) }}
            >
                <View style={styles.cropModalRoot}>
                    <View style={styles.cropModalHeader}>
                        <Pressable
                            onPress={() => { setShowCropModal(false); setCropImageUri(null) }}
                            hitSlop={12}
                            style={styles.cropModalClose}
                        >
                            <Ionicons name="close" size={24} color="#fff" />
                        </Pressable>
                        <Text style={styles.cropModalTitle}>抽出する範囲を切り取ろう</Text>
                        <View style={styles.cropModalHeaderRight} />
                    </View>
                    {cropImageUri && (
                        <View
                            style={styles.cropImageContainer}
                            onLayout={(e) => setCropContainerLayout(e.nativeEvent.layout)}
                            {...cropPanResponder.panHandlers}
                        >
                            <Image
                                source={{ uri: cropImageUri }}
                                style={styles.cropImage}
                                resizeMode="contain"
                            />
                            {cropContainerLayout.width > 0 && cropContainerLayout.height > 0 && (() => {
                                const { offsetX, offsetY, displayW, displayH } = (() => {
                                    const cw = cropContainerLayout.width
                                    const ch = cropContainerLayout.height
                                    const iw = cropImageWidth || 1
                                    const ih = cropImageHeight || 1
                                    const scale = Math.min(cw / iw, ch / ih)
                                    const dw = iw * scale
                                    const dh = ih * scale
                                    return { offsetX: (cw - dw) / 2, offsetY: (ch - dh) / 2, displayW: dw, displayH: dh }
                                })()
                                const selLeft = offsetX + cropRect.x * displayW
                                const selTop = offsetY + cropRect.y * displayH
                                const selWidth = cropRect.width * displayW
                                const selHeight = cropRect.height * displayH
                                const ch = cropContainerLayout.height
                                const cw = cropContainerLayout.width
                                return (
                                    <>
                                        <View style={[styles.cropDim, { top: 0, left: 0, right: 0, height: selTop }]} pointerEvents="none" />
                                        <View style={[styles.cropDim, { bottom: 0, left: 0, right: 0, height: ch - selTop - selHeight }]} pointerEvents="none" />
                                        <View style={[styles.cropDim, { left: 0, top: selTop, width: selLeft, height: selHeight }]} pointerEvents="none" />
                                        <View style={[styles.cropDim, { right: 0, top: selTop, width: cw - selLeft - selWidth, height: selHeight }]} pointerEvents="none" />
                                        <View
                                            style={[
                                                styles.cropFrame,
                                                { left: selLeft, top: selTop, width: selWidth, height: selHeight },
                                            ]}
                                            pointerEvents="none"
                                        >
                                            <View style={styles.cropCenterCrossV} pointerEvents="none" />
                                            <View style={styles.cropCenterCrossH} pointerEvents="none" />
                                        </View>
                                    </>
                                )
                            })()}
                        </View>
                    )}
                    <View style={styles.cropModalFooter}>
                        <View style={styles.cropModalFooterRow}>
                            <Pressable
                                style={styles.cropRetakeButton}
                                onPress={() => {
                                    setShowCropModal(false)
                                    setCropImageUri(null)
                                    if (cropPhotoSource) handlePhotoToThemes(cropPhotoSource === 'camera')
                                }}
                            >
                                <Text style={styles.cropRetakeButtonText}>再撮影</Text>
                            </Pressable>
                            <Pressable
                                style={styles.cropSubmitButton}
                                onPress={submitCropAndExtractThemes}
                            >
                                <Text style={styles.cropSubmitButtonText}>この範囲で抽出する</Text>
                                <Ionicons name="add" size={20} color="#fff" />
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showCreateModal}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setShowCreateModal(false)}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={0}
                >
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.modalContainer}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>復習カード作成</Text>
                            <Pressable onPress={() => setShowCreateModal(false)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </Pressable>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>教材選択</Text>
                            <View style={styles.headerRow}>
                                <Text style={styles.mutedText}>
                                    {selectedBookId
                                        ? referenceBooks.find((b) => b.id === selectedBookId)?.name
                                        : '教材が未選択です'}
                                </Text>
                                <Pressable style={styles.outlineButton} onPress={() => setShowBookPicker((prev) => !prev)}>
                                    <Text style={styles.outlineButtonText}>{showBookPicker ? '閉じる' : '教材を選ぶ'}</Text>
                                </Pressable>
                            </View>
                            {showBookPicker && (
                                <View style={styles.bookPickerArea}>
                                    <View style={styles.bookHeaderRow}>
                                        <Text style={styles.bookHeaderText}>教材リスト</Text>
                                        <Pressable style={styles.addChipButton} onPress={() => setShowAddBookForm((prev) => !prev)}>
                                            <Ionicons name="add" size={16} color="#334155" />
                                            <Text style={styles.addChipText}>追加</Text>
                                        </Pressable>
                                    </View>
                                    {showAddBookForm && (
                                        <View style={styles.addCard}>
                                            <Text style={styles.addCardTitle}>{editingBookId ? '教材を編集' : '新しい教材を追加'}</Text>
                                            <Text style={styles.inputLabel}>名前</Text>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="例: チャート式数学I"
                                                value={newBookName}
                                                onChangeText={setNewBookName}
                                            />
                                            <Text style={styles.inputLabel}>画像（任意）</Text>
                                            <Pressable style={styles.imageSelectButton} onPress={pickBookImage}>
                                                {newBookImage ? (
                                                    <Image source={{ uri: newBookImage }} style={{ width: 100, height: 100, borderRadius: 8 }} />
                                                ) : (
                                                    <Text style={styles.imageSelectText}>画像を選択</Text>
                                                )}
                                            </Pressable>
                                            <View style={styles.modalActions}>
                                                <Pressable
                                                    style={styles.cancelButton}
                                                    onPress={() => {
                                                        setShowAddBookForm(false)
                                                        setNewBookName('')
                                                        setNewBookImage(null)
                                                        setEditingBookId(null)
                                                    }}
                                                >
                                                    <Text style={styles.cancelButtonText}>キャンセル</Text>
                                                </Pressable>
                                                <Pressable style={styles.submitButton} onPress={handleAddBook}>
                                                    <Text style={styles.submitButtonText}>{editingBookId ? '保存' : '追加'}</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    )}
                                    <View style={styles.bookGrid}>
                                        {referenceBooks.map((book) => (
                                            <View
                                                key={book.id}
                                                style={[
                                                    styles.bookCard,
                                                    selectedBookId === book.id && styles.bookCardActive,
                                                ]}
                                            >
                                                <View style={styles.cardActionRow}>
                                                    <Pressable style={styles.iconButton} onPress={() => {
                                                        setEditingBookId(book.id)
                                                        setNewBookName(book.name)
                                                        setNewBookImage(book.image_url)
                                                        setShowAddBookForm(true)
                                                    }}>
                                                        <Ionicons name="create-outline" size={16} color="#64748b" />
                                                    </Pressable>
                                                    <Pressable style={styles.iconButton} onPress={() => handleDeleteBook(book.id)}>
                                                        <Ionicons name="trash-outline" size={16} color="#64748b" />
                                                    </Pressable>
                                                </View>
                                                <Pressable
                                                    style={styles.bookSelectArea}
                                                    onPress={() => {
                                                        setSelectedBookId(book.id)
                                                    }}
                                                >
                                                    <View style={styles.bookImageBox}>
                                                        {book.image_url ? (
                                                            <Image source={{ uri: book.image_url }} style={styles.bookImage} />
                                                        ) : (
                                                            <Ionicons name="book-outline" size={32} color="#94a3b8" />
                                                        )}
                                                    </View>
                                                    <Text style={styles.bookCardText} numberOfLines={2}>{book.name}</Text>
                                                </Pressable>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>学習日</Text>
                            <Pressable
                                style={styles.dateSelector}
                                onPress={() => setShowDatePicker((prev) => !prev)}
                            >
                                <Ionicons name="calendar-outline" size={20} color="#64748b" />
                                <Text style={styles.dateSelectorText}>
                                    {formatDateLabel(selectedDate)}
                                </Text>
                            </Pressable>
                            {showDatePicker && (
                                <DateTimePicker
                                    value={selectedDate}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                    onChange={(event, date) => {
                                        if (Platform.OS === 'android') {
                                            setShowDatePicker(false)
                                        }
                                        if (date) setSelectedDate(date)
                                    }}
                                />
                            )}
                        </View>

                        <Pressable
                            style={[styles.outlineButton, styles.photoThemeButton]}
                            onPress={() => {
                                Alert.alert(
                                    '写真からテーマを抽出',
                                    'カメラで撮影するか、ライブラリから選んでください。',
                                    [
                                        { text: 'キャンセル', style: 'cancel' },
                                        { text: 'カメラ', onPress: () => handlePhotoToThemes(true) },
                                        { text: 'ライブラリ', onPress: () => handlePhotoToThemes(false) },
                                    ]
                                )
                            }}
                            disabled={photoThemeLoading}
                        >
                            <Ionicons name="camera" size={18} color="#2563eb" />
                            <Text style={styles.photoThemeButtonText}>
                                {photoThemeLoading ? '抽出中...' : '写真からテーマを抽出（最大5件）'}
                            </Text>
                        </Pressable>

                        <View style={styles.modeToggle}>
                            <Pressable
                                style={[styles.modeButton, createMode === 'ai' && styles.modeButtonActive]}
                                onPress={() => setCreateMode('ai')}
                            >
                                <Text style={[styles.modeButtonText, createMode === 'ai' && styles.modeButtonTextActive]}>
                                    AIモード
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modeButton, createMode === 'flashcard' && styles.modeButtonActive]}
                                onPress={() => setCreateMode('flashcard')}
                            >
                                <Text style={[styles.modeButtonText, createMode === 'flashcard' && styles.modeButtonTextActive]}>
                                    単語帳モード
                                </Text>
                            </Pressable>
                        </View>

                        {createMode === 'ai' ? (
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionTitle}>学習メモ（AIが問題を自動生成）</Text>
                                {aiNotes.map((note, index) => (
                                    <View key={`note-${index}`} style={styles.noteRow}>
                                        <TextInput
                                            style={styles.noteInput}
                                            placeholder="例: 英文法の比較級について"
                                            value={note}
                                            onChangeText={(text) => {
                                                const next = [...aiNotes]
                                                next[index] = text
                                                setAiNotes(next)
                                            }}
                                            multiline
                                        />
                                        <Pressable
                                            style={styles.deleteButton}
                                            onPress={() => {
                                                const next = aiNotes.filter((_, i) => i !== index)
                                                setAiNotes(next.length ? next : [''])
                                            }}
                                        >
                                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                        </Pressable>
                                    </View>
                                ))}
                                <Pressable style={styles.addButton} onPress={() => setAiNotes([...aiNotes, ''])}>
                                    <Ionicons name="add" size={16} color="#2563eb" />
                                    <Text style={styles.addButtonText}>メモを追加</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.inputSection}>
                                <Text style={styles.sectionTitle}>フラッシュカード</Text>
                                {flashcards.map((card, index) => (
                                    <View key={`card-${index}`} style={styles.flashcardCard}>
                                        <View style={styles.flashcardHeader}>
                                            <Text style={styles.flashcardTitle}>カード {index + 1}</Text>
                                            <Pressable
                                                style={styles.deleteButton}
                                                onPress={() => {
                                                    const next = flashcards.filter((_, i) => i !== index)
                                                    setFlashcards(next.length ? next : [{ question: '', answer: '' }])
                                                }}
                                            >
                                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                            </Pressable>
                                        </View>
                                        <Text style={styles.flashcardLabel}>問題（表面）</Text>
                                        <TextInput
                                            style={styles.flashcardInput}
                                            placeholder="例: apple"
                                            value={card.question}
                                            onChangeText={(text) => {
                                                const next = [...flashcards]
                                                next[index] = { ...next[index], question: text }
                                                setFlashcards(next)
                                            }}
                                            multiline
                                        />
                                        <Text style={styles.flashcardLabel}>答え（裏面）</Text>
                                        <TextInput
                                            style={[styles.flashcardInput, styles.answerInput]}
                                            placeholder="例: りんご"
                                            value={card.answer}
                                            onChangeText={(text) => {
                                                const next = [...flashcards]
                                                next[index] = { ...next[index], answer: text }
                                                setFlashcards(next)
                                            }}
                                            multiline
                                        />
                                    </View>
                                ))}
                                <Pressable style={styles.addButton} onPress={() => setFlashcards([...flashcards, { question: '', answer: '' }])}>
                                    <Ionicons name="add" size={16} color="#2563eb" />
                                    <Text style={styles.addButtonText}>カードを追加</Text>
                                </Pressable>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <Pressable style={styles.cancelButton} onPress={() => setShowCreateModal(false)}>
                                <Text style={styles.cancelButtonText}>キャンセル</Text>
                            </Pressable>
                            <Pressable style={styles.submitButton} onPress={handleCreate}>
                                <Text style={styles.submitButtonText}>作成</Text>
                            </Pressable>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    container: {
        padding: 16,
        backgroundColor: '#f8fafc',
        gap: 12,
        flexGrow: 1,
    },
    card: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 16,
        padding: 16,
        backgroundColor: '#ffffff',
        gap: 10,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
    },
    mutedText: {
        fontSize: 12,
        color: '#64748b',
    },
    outlineButton: {
        borderWidth: 1,
        borderColor: '#cbd5f5',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    outlineButtonText: {
        color: '#2563eb',
        fontWeight: '600',
        fontSize: 12,
    },

    photoThemeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 4,
    },
    photoThemeButtonText: {
        color: '#2563eb',
        fontWeight: '600',
        fontSize: 14,
    },
    taskCard: {
        marginTop: 12,
        gap: 12,
    },
    themeCard: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        gap: 8,
    },
    themeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    themeTitle: {
        fontSize: 13,
        fontWeight: '600',
    },
    difficultyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
    },
    difficultyLabel: {
        fontSize: 12,
        color: '#64748b',
        marginRight: 4,
    },
    difficultyButton: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#f8fafc',
    },
    difficultyButtonActive: {
        borderColor: '#2563eb',
        backgroundColor: '#2563eb',
    },
    difficultyText: {
        fontSize: 11,
        color: '#334155',
        fontWeight: '600',
    },
    difficultyTextActive: {
        color: '#ffffff',
    },
    quizBlock: {
        gap: 10,
    },
    quizItem: {
        gap: 8,
    },
    quizQuestion: {
        fontSize: 13,
        fontWeight: '600',
    },
    choiceButton: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        padding: 8,
    },
    choiceCorrect: {
        backgroundColor: '#dcfce7',
        borderColor: '#22c55e',
    },
    choiceWrong: {
        backgroundColor: '#fee2e2',
        borderColor: '#ef4444',
    },
    choiceText: {
        fontSize: 12,
    },
    flashcardButton: {
        backgroundColor: '#dbeafe',
        borderColor: '#3b82f6',
    },
    flashcardButtonText: {
        color: '#1e40af',
    },
    flashcardContainer: {
        marginTop: 8,
        gap: 12,
    },
    flashcardCard: {
        backgroundColor: '#f8fafc',
        borderWidth: 1.5,
        borderColor: '#60a5fa',
        borderRadius: 10,
        padding: 10,
        gap: 6,
    },
    flashcardLabel: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '600',
        textTransform: 'uppercase',
        marginTop: 2,
    },
    answerLabel: {
        color: '#16a34a',
        marginTop: 12,
    },
    flashcardQuestion: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0f172a',
    },
    flashcardAnswer: {
        fontSize: 15,
        color: '#15803d',
        fontWeight: '500',
    },
    showAnswerButton: {
        backgroundColor: '#dbeafe',
        borderColor: '#3b82f6',
    },
    flashcardActions: {
        flexDirection: 'row',
        gap: 8,
    },
    completeButton: {
        flex: 1,
        backgroundColor: '#dcfce7',
        borderColor: '#22c55e',
    },
    completeButtonText: {
        color: '#15803d',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
    },
    createButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563eb',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    createButtonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
    modalContainer: {
        padding: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 300, // Increased for keyboard spacing
        backgroundColor: '#f8fafc',
        flexGrow: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0f172a',
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#334155',
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        backgroundColor: '#ffffff',
    },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#ffffff',
    },
    dateSelectorText: {
        fontSize: 15,
        color: '#0f172a',
    },
    modeToggle: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    modeButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    modeButtonActive: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    modeButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
    },
    modeButtonTextActive: {
        color: '#ffffff',
    },
    inputSection: {
        gap: 12,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 8,
    },
    noteRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    noteInput: {
        flex: 1,
        borderWidth: 2,
        borderColor: '#3b82f6',
        borderRadius: 12,
        padding: 14,
        fontSize: 14,
        backgroundColor: '#ffffff',
        minHeight: 70,
        textAlignVertical: 'top',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
    },
    deleteButton: {
        padding: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#fecaca',
        backgroundColor: '#fee2e2',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
    },
    addButtonText: {
        fontSize: 14,
        color: '#2563eb',
        fontWeight: '600',
    },
    flashcardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    flashcardTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1e40af',
    },
    flashcardInput: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 6,
        padding: 8,
        fontSize: 13,
        backgroundColor: '#f8fafc',
        minHeight: 40,
        textAlignVertical: 'top',
    },
    answerInput: {
        backgroundColor: '#fef9e7',
        borderColor: '#f59e0b',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    cancelButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#64748b',
    },
    submitButton: {
        flex: 1,
        backgroundColor: '#2563eb',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    submitButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
    },
    emptyState: {
        marginTop: 40,
        marginBottom: 20,
        paddingVertical: 50,
        paddingHorizontal: 30,
        alignItems: 'center',
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: 20,
    },
    emptyIconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 12,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    emptyActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#2563eb',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    emptyActionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ffffff',
    },
    bookPickerArea: {
        marginTop: 12,
        gap: 12,
    },
    bookHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bookHeaderText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#334155',
    },
    addChipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
    },
    addChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#334155',
    },
    addCard: {
        borderWidth: 2,
        borderColor: '#bfdbfe',
        borderRadius: 12,
        padding: 12,
        backgroundColor: '#f8fafc',
        gap: 8,
        marginBottom: 12,
    },
    addCardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e40af',
        marginBottom: 4,
    },
    imageSelectButton: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: '#ffffff',
    },
    imageSelectText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#475569',
    },
    bookGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    bookCard: {
        width: '48%',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        backgroundColor: '#ffffff',
        position: 'relative',
    },
    bookCardActive: {
        borderColor: '#2563eb',
        backgroundColor: '#eff6ff',
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    trashButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        backgroundColor: '#f8fafc',
        padding: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    bookSelectArea: {
        alignItems: 'center',
        gap: 8,
    },
    bookImageBox: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    bookImage: {
        width: 60,
        height: 60,
        resizeMode: 'cover',
    },
    bookCardText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0f172a',
        textAlign: 'center',
    },
    explanationText: {
        fontSize: 14,
        color: '#475569',
        backgroundColor: '#f1f5f9',
        padding: 8,
        borderRadius: 8,
        marginTop: 8,
        lineHeight: 20,
    },
    subjectList: {
        gap: 12,
        marginTop: 12,
    },
    subjectCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    subjectCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    subjectIconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    subjectImage: {
        width: 48,
        height: 48,
        resizeMode: 'cover',
    },
    subjectTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 4,
    },
    badgeRow: {
        flexDirection: 'row',
    },
    cnadge: {
        backgroundColor: '#eff6ff',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    cnadgeText: {
        fontSize: 12,
        color: '#2563eb',
        fontWeight: '600',
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
    },
    backButtonText: {
        color: '#64748b',
        fontWeight: '600',
        fontSize: 13,
    },
    cardActionRow: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'row',
        gap: 8,
        zIndex: 10,
    },
    iconButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
    },
    // SM-2 rating buttons
    perfectButton: {
        backgroundColor: '#dcfce7',
        borderColor: '#22c55e',
        flex: 1,
    },
    perfectButtonText: {
        color: '#15803d',
        fontWeight: '700',
    },
    goodButton: {
        backgroundColor: '#fef9c3',
        borderColor: '#eab308',
        flex: 1,
    },
    goodButtonText: {
        color: '#a16207',
        fontWeight: '700',
    },
    hardButton: {
        backgroundColor: '#fee2e2',
        borderColor: '#ef4444',
        flex: 1,
    },
    hardButtonText: {
        color: '#b91c1c',
        fontWeight: '700',
    },
    dontKnowButton: {
        backgroundColor: '#f1f5f9',
        borderColor: '#94a3b8',
        marginTop: 4,
    },
    dontKnowButtonText: {
        color: '#475569',
        fontWeight: '700',
    },
    editThemeButton: {
        backgroundColor: '#fefce8',
        borderColor: '#fbbf24',
        marginTop: 4,
    },
    editThemeButtonText: {
        color: '#92400e',
        fontWeight: '700',
    },
    editThemeContainer: {
        marginTop: 8,
        gap: 8,
        backgroundColor: '#fefce8',
        borderWidth: 1,
        borderColor: '#fbbf24',
        borderRadius: 10,
        padding: 10,
    },
    editThemeInput: {
        borderWidth: 1,
        borderColor: '#fbbf24',
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        backgroundColor: '#ffffff',
        minHeight: 60,
        textAlignVertical: 'top',
    },
    editThemeActions: {
        flexDirection: 'row',
        gap: 8,
    },
    editThemeCancelButton: {
        flex: 1,
        backgroundColor: '#f1f5f9',
        borderColor: '#94a3b8',
    },
    editThemeSubmitButton: {
        flex: 2,
        backgroundColor: '#fef9c3',
        borderColor: '#eab308',
    },
    editThemeSubmitText: {
        color: '#713f12',
        fontWeight: '700',
    },
    cropModalRoot: {
        flex: 1,
        backgroundColor: '#000',
    },
    cropModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 24,
        paddingBottom: 12,
    },
    cropModalClose: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropModalTitle: {
        fontSize: 16,
        color: '#fff',
        fontWeight: '600',
    },
    cropModalHeaderRight: {
        width: 40,
    },
    cropImageContainer: {
        flex: 1,
        position: 'relative',
    },
    cropImage: {
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: undefined,
        height: undefined,
    },
    cropDim: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    cropFrame: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#3b82f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cropCenterCrossV: {
        width: 2,
        height: 20,
        backgroundColor: 'rgba(255,255,255,0.8)',
    },
    cropCenterCrossH: {
        position: 'absolute',
        width: 20,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.8)',
    },
    cropModalFooter: {
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },
    cropModalFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    cropRetakeButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
    },
    cropRetakeButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    cropSubmitButton: {
        flex: 1,
        backgroundColor: '#3b82f6',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    cropSubmitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
})

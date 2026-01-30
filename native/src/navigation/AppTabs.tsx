import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { HomeScreen } from '../screens/HomeScreen'
import { StudyScreen } from '../screens/StudyScreen'
import { QAScreen } from '../screens/QAScreen'
import { LogScreen } from '../screens/LogScreen'
import { SettingsScreen } from '../screens/SettingsScreen'

export type AppTabParamList = {
  Home: undefined
  Study: undefined
  QA: undefined
  Log: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<AppTabParamList>()

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
          borderTopColor: '#e2e8f0',
        },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home-outline',
            Study: 'book-outline',
            QA: 'chatbubble-outline',
            Log: 'bar-chart-outline',
            Settings: 'settings-outline',
          }
          const iconName = map[route.name] || 'ellipse-outline'
          return <Ionicons name={iconName} size={size} color={color} />
        },
        headerTitleAlign: 'center',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'ホーム' }} />
      <Tab.Screen name="Study" component={StudyScreen} options={{ title: '学習' }} />
      <Tab.Screen name="QA" component={QAScreen} options={{ title: 'Q&A' }} />
      <Tab.Screen name="Log" component={LogScreen} options={{ title: '記録' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '設定' }} />
    </Tab.Navigator>
  )
}

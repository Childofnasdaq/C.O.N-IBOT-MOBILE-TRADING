'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Home, Plug, Settings } from 'lucide-react'
import MetaApi from 'metaapi.cloud-sdk'

function TradingDashboard() {
  // State declarations
  const [authForm, setAuthForm] = useState({ mentorId: '', email: '', licenseKey: '' })
  const [connectForm, setConnectForm] = useState({ apiToken: '', accountId: '' })
  const [settings, setSettings] = useState({
    riskPerTrade: 2,
    stopLoss: 10,
    takeProfitMultiplier: 2,
    tradeSize: 0.01,
    tradingPairs: 'XAUUSD',
    copyAllTrades: true,
    enableNotifications: true
  })
  const [isTrading, setIsTrading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('authentication')
  const [isConnected, setIsConnected] = useState(false)
  const metaApiRef = useRef<MetaApi | null>(null)
  const connectionRef = useRef<any>(null)

  // Helper function for logging
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prevLogs => [...prevLogs, `[${timestamp}] ${message}`])
  }

  // Authentication function
  const authenticateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validateCredentials(authForm.mentorId, authForm.email, authForm.licenseKey)) {
      addLog('Authentication successful for Mentor ID: ' + authForm.mentorId)
      setActiveTab('home')
    } else {
      addLog('Authentication failed - Invalid credentials')
      alert('Invalid Mentor ID, Email, or License Key.')
    }
  }

  // Validation helper
  const validateCredentials = (mentorId: string, email: string, licenseKey: string) => {
    return mentorId && email && licenseKey
  }

  // Connect to MetaAPI
  const connectToAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    addLog('Connecting to MetaApi...')
    try {
      metaApiRef.current = new MetaApi(connectForm.apiToken)
      const account = await metaApiRef.current.metatraderAccountApi.getAccount(connectForm.accountId)
      
      if (!account.connectionStatus || account.connectionStatus === 'DISCONNECTED') {
        await account.deploy()
      }
      
      await account.waitConnected()
      connectionRef.current = account.getRPCConnection()
      await connectionRef.current.connect()
      
      addLog('Connected to MetaApi successfully')
      setIsConnected(true)
      setActiveTab('home')
    } catch (error: any) {
      addLog(`Error connecting to MetaApi: ${error.message}`)
      console.error('Full error:', error)
    }
  }

  // Trading functions
  const checkMarketDirectionAndTrade = async (symbol: string, retryCount = 0) => {
    if (!isConnected || !connectionRef.current) {
      addLog(`Not connected to MetaApi. Cannot place trade for ${symbol}.`);
      return;
    }

    try {
      const price = await connectionRef.current.getSymbolPrice(symbol);
      addLog(`Fetched price for ${symbol}: Bid ${price.bid}, Ask ${price.ask}`);

      const { bid, ask } = price;
      const specification = await connectionRef.current.getSymbolSpecification(symbol);
      const point = specification.point;

      // Market direction analysis based on bid-ask spread
      const isUptrend = (ask - bid) > (point * 2); // If spread is wider than 2 points, consider it an uptrend

      addLog(`Market direction for ${symbol}: ${isUptrend ? 'Uptrend' : 'Downtrend'}`);

      // Calculate SL and TP based on settings
      const slPercentage = settings.stopLoss / 100;
      const tpPercentage = slPercentage * settings.takeProfitMultiplier;

      let stopLossPrice, takeProfitPrice;

      if (isUptrend) {
        // For buy orders
        stopLossPrice = ask * (1 - slPercentage);
        takeProfitPrice = ask * (1 + tpPercentage);
        
        addLog(`Placing 20 BUY orders for ${symbol}`);
        
        // Place 20 buy orders
        for (let i = 0; i < 20; i++) {
          const result = await connectionRef.current.createMarketBuyOrder(
            symbol,
            settings.tradeSize,
            stopLossPrice,
            takeProfitPrice,
            { comment: 'C.O.N-IBOT-MOBILE' }
          );
          addLog(`BUY order ${i + 1} placed for ${symbol}. Order ID: ${result.orderId}`);
          // Add small delay between orders to prevent overload
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } else {
        // For sell orders
        stopLossPrice = bid * (1 + slPercentage);
        takeProfitPrice = bid * (1 - tpPercentage);
        
        addLog(`Placing 20 SELL orders for ${symbol}`);
        
        // Place 20 sell orders
        for (let i = 0; i < 20; i++) {
          const result = await connectionRef.current.createMarketSellOrder(
            symbol,
            settings.tradeSize,
            stopLossPrice,
            takeProfitPrice,
            { comment: 'C.O.N-IBOT-MOBILE' }
          );
          addLog(`SELL order ${i + 1} placed for ${symbol}. Order ID: ${result.orderId}`);
          // Add small delay between orders to prevent overload
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      addLog(`All 20 trades placed successfully for ${symbol}`);
      addLog(`Stop Loss: ${stopLossPrice.toFixed(5)}`);
      addLog(`Take Profit: ${takeProfitPrice.toFixed(5)}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error placing trades for ${symbol}: ${errorMessage}`);
      console.error('Full error:', error);

      // Retry logic
      if (retryCount < 3) {
        addLog(`Retrying trades for ${symbol} (Attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await checkMarketDirectionAndTrade(symbol, retryCount + 1);
      } else {
        addLog(`Failed to place trades for ${symbol} after 3 attempts`);
      }
    }
  };

  const startTradingLogs = async () => {
    addLog("Verifying account....");
    await new Promise(resolve => setTimeout(resolve, 2000));
    addLog("Account details successfully submitted.....");
    await new Promise(resolve => setTimeout(resolve, 2000));
    addLog("Fetching trading symbols...");

    const pairs = settings.tradingPairs.split(',').map(pair => pair.trim());
    addLog(`Trading pairs: ${pairs.join(', ')}`);

    // Process each trading pair
    for (const pair of pairs) {
      addLog(`Analyzing market direction for ${pair}`);
      await checkMarketDirectionAndTrade(pair);
      // Add delay between different pairs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const toggleTrade = () => {
    setIsTrading(prev => !prev);
    if (!isTrading) {
      addLog("Trading started...");
      startTradingLogs();
    } else {
      addLog("Trading stopped.");
    }
  }

  // Settings function
  const saveSettings = () => {
    addLog(`Settings saved: Risk ${settings.riskPerTrade}%, Stop Loss ${settings.stopLoss}%, TP Multiplier ${settings.takeProfitMultiplier}`)
    alert('Settings saved successfully!')
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.close()
      }
    }
  }, [])

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-gray-100">
      <main className="flex-grow p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 bg-gray-800">
            <TabsTrigger value="authentication" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              Authentication
            </TabsTrigger>
            <TabsTrigger value="home" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              Home
            </TabsTrigger>
            <TabsTrigger value="connect" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              Connect
            </TabsTrigger>
          </TabsList>

          {/* Authentication Tab */}
          <TabsContent value="authentication">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-100">Authentication</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={authenticateUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mentorId" className="text-gray-300">Mentor ID</Label>
                    <Input
                      id="mentorId"
                      value={authForm.mentorId}
                      onChange={(e) => setAuthForm({ ...authForm, mentorId: e.target.value })}
                      required
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-300">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      required
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseKey" className="text-gray-300">License Key</Label>
                    <Input
                      id="licenseKey"
                      value={authForm.licenseKey}
                      onChange={(e) => setAuthForm({ ...authForm, licenseKey: e.target.value })}
                      required
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 text-white hover:bg-red-700">
                    Authenticate
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Connect Tab */}
          <TabsContent value="connect">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-100">Connect MetaApi Account</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={connectToAccount} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiToken" className="text-gray-300">MetaApi Token</Label>
                    <Input
                      id="apiToken"
                      value={connectForm.apiToken}
                      onChange={(e) => setConnectForm({ ...connectForm, apiToken: e.target.value })}
                      required
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountId" className="text-gray-300">MetaApi Account ID</Label>
                    <Input
                      id="accountId"
                      value={connectForm.accountId}
                      onChange={(e) => setConnectForm({ ...connectForm, accountId: e.target.value })}
                      required
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 text-white hover:bg-red-700">
                    Connect
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Home Tab */}
          <TabsContent value="home">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-100">CHILD OF NASDAQ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center">
                  <img 
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/IMG_20240811_184405.jpg-IcR54szYCMJDC2Z2fNYBkDVbdgRug2.jpeg" 
                    alt="Child of Nasdaq Logo" 
                    className="w-64 h-64 object-cover rounded-lg mb-4 border-4 border-red-500" 
                  />
                  <p className="text-red-500 font-bold">C.O.N-IBOT, 24/7 OPERATION</p>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg relative">
                  <div className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <h3 className="font-bold mb-2 text-gray-100">Bot Logs</h3>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {logs.map((log, index) => (
                      <li key={index} className="text-sm text-gray-300">{log}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex justify-between">
                  <Button 
                    onClick={toggleTrade} 
                    variant={isTrading ? "destructive" : "default"} 
                    className={isTrading ? "bg-red-700 text-white" : "bg-red-600 text-white hover:bg-red-700"}
                  >
                    {isTrading ? "Stop Trading" : "Start Trading"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab('settings')} 
                    className="border-red-500 text-gray-300 hover:bg-gray-700"
                  >
                    Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-gray-100">Risk Management Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); saveSettings(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="riskPerTrade" className="text-gray-300">Max Risk Per Trade (%)</Label>
                    <Input
                      id="riskPerTrade"
                      type="number"
                      value={settings.riskPerTrade}
                      onChange={(e) => setSettings({ ...settings, riskPerTrade: parseFloat(e.target.value) })}
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stopLoss" className="text-gray-300">Stop Loss (pips)</Label>
                    <Input
                      id="stopLoss"
                      type="number"
                      value={settings.stopLoss}
                      onChange={(e) => setSettings({ ...settings, stopLoss: parseFloat(e.target.value) })}
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="takeProfitMultiplier" className="text-gray-300">Take Profit Multiplier</Label>
                    <Input
                      id="takeProfitMultiplier"
                      type="number"
                      value={settings.takeProfitMultiplier}
                      onChange={(e) => setSettings({ ...settings, takeProfitMultiplier: parseFloat(e.target.value) })}
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tradeSize" className="text-gray-300">Trade Size (Lots)</Label>
                    <Input
                      id="tradeSize"
                      type="number"
                      value={settings.tradeSize}
                      onChange={(e) => setSettings({ ...settings, tradeSize: parseFloat(e.target.value) })}
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tradingPairs" className="text-gray-300">Trading Pairs (comma-separated)</Label>
                    <Input
                      id="tradingPairs"
                      value={settings.tradingPairs}
                      onChange={(e) => setSettings({ ...settings, tradingPairs: e.target.value })}
                      className="bg-gray-700 border-gray-600 text-gray-100"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="copyAllTrades"
                      checked={settings.copyAllTrades}
                      onCheckedChange={(checked) => setSettings({ ...settings, copyAllTrades: checked })}
                      className="data-[state=checked]:bg-red-500"
                    />
                    <Label htmlFor="copyAllTrades" className="text-gray-300">Copy All Trades</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enableNotifications"
                      checked={settings.enableNotifications}
                      onCheckedChange={(checked) => setSettings({ ...settings, enableNotifications: checked })}
                      className="data-[state=checked]:bg-red-500"
                    />
                    <Label htmlFor="enableNotifications" className="text-gray-300">Enable Notifications</Label>
                  </div>
                  <Button type="submit" className="w-full bg-red-600 text-white hover:bg-red-700">
                    Save Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex justify-around">
          <Button variant="ghost" onClick={() => setActiveTab('home')} className="text-gray-300 hover:bg-gray-700">
            <Home className="h-5 w-5" />
            <span className="sr-only">Home</span>
          </Button>
          <Button variant="ghost" onClick={() => setActiveTab('connect')} className="text-gray-300 hover:bg-gray-700">
            <Plug className="h-5 w-5" />
            <span className="sr-only">Connect</span>
          </Button>
          <Button variant="ghost" onClick={() => setActiveTab('settings')} className="text-gray-300 hover:bg-gray-700">
            <Settings className="h-5 w-5" />
            <span className="sr-only">Settings</span>
          </Button>
        </div>
      </footer>
    </div>
  )
}

export default TradingDashboard

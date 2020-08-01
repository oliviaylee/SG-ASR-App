import React, { Component } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableHighlight,
  Animated,
  Easing,
  View,
  Button,
  Dimensions,
  NativeEventEmitter
} from 'react-native';
import { WebBrowser, Audio, Permissions, FileSystem } from 'expo';

import { MonoText } from '../components/StyledText';

import {
  Cell,
  Section,
  TableView
} from 'react-native-tableview-simple';

import Svg,{
    Circle,
    Ellipse,
    G,
    LinearGradient,
    RadialGradient,
    Line,
    Path,
    Polygon,
    Polyline,
    Rect,
    Symbol,
    Use,
    Defs,
    Stop
} from 'react-native-svg';

var fetchData = require("../fetchData");

var searchRanker = require("../searchRanker")

var recommender = require("../recommender")

var helperFunctions = require("../helperFunctions")

var dijkstraConvex = require("../dijkstraConvex")

const callbags = require("../callbags/callbags")

export default class HomeScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = {shelfHighlight: null, pathHighlight: null, locHighlight: null, animatedOpacity: new Animated.Value(1), isRecording: false, soundLoaded: false, audioPlaying: false, nextScreen: true, asrLoaded: false, cells: false, polygonMap: false, serverURL: fetchData.StateData.ServerURL};
    this.searchRanker = null;
    this.recommender = null;
    this.storeData = null;
    this.asrText = null;
    this.resultCells = null;
    this.rankingResults = null;
    this.startRecordingEnable = true;
    this.sstopRecordingEnable = false;
    this.mapRenderComplete = null;
    this.polygonMap = null;
    this.mapHighlight = null;
    this.pathHighlight = null;
    this.computedPath = null;
    this.locHighlight = null;
    let {height, width} = Dimensions.get("window")
    this.height = height
    this.width = width
    this.location = [0.1, 0.1]
    this.selectedItem = null;
    this.mounted = false;
  }
  static navigationOptions = {
    title: "Home",
  };

  componentWillMount(){
    if (this.location){
      let loc = this.makeCircle()
      this.locHighlight = loc
      this.setState({
        locHighlight: loc
      })
    }
    this.searchRanker = this.getRanker()
    this.recommender = this.getRecommender()
    this.storeData = fetchData.getStoreData()
    this.mapRenderComplete = this.generateMap.bind(this)()
  }

  componentDidMount(){ 
    this.storeDataStream = callbags.factoryToCallback(async data => {
      this.storeData = data
      this.searchRanker = await this.getRanker()
      this.recommender = await this.getRecommender()
      this.refreshSearchResults.bind(this)()
    })
    this.storeDataStream.callbag(fetchData.storeDataStream.callbag)
    this.mounted = true
    this.asrStream = callbags.factoryToCallback(async data => {
      this.asrText = data
      var [ran, storeData] = await Promise.all([this.searchRanker, this.storeData]);
      this.searchRanker = ran
      this.storeData = storeData
      this.setState({ 
        asrLoaded: true
      })
      this.rankingResults = ran(data) 
      this.displaySearchResults.bind(this)() 
    })
    this.asrStream.callbag(fetchData.asrStream.callbag)
  }

  componentWillUnmount(){
    this.mounted = false
    this.asrStream.terminate()
    this.storeDataStream.terminate()
  }

  async startAudioRecording(){ 
    if (!this.startRecordingEnable){ 
      return
    }
    this.startRecordingEnable = false
    await Permissions.askAsync(Permissions.AUDIO_RECORDING);
    await Audio.setIsEnabledAsync(true);
    await Audio.setAudioModeAsync({ 
      allowsRecordingIOS: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    });
    this.recording = new Audio.Recording();
    try {
      await this.recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await this.recording.startAsync();
    } catch (error) {
      alert(error)
    }
    this.setState({ 
      isRecording: true
    })
    this.radialAnimation = Animated.loop( 
      Animated.timing(
        this.state.animatedOpacity,
        {
          toValue: 1.2,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true
        }
      )
    )
    this.radialAnimation.start()
    this.sstopRecordingEnable = true 
  }

  async renderItemOP(x){
    if (x == null){
      return
    } 
    this.selectedItem = x
    try{
      fetchData.StateData.SelectedShelf = (await this.storeData)["map"]["shelfMap"][x.shelfLocation][x.shelfColumn]
    }
    catch(e){
      fetchData.StateData.SelectedShelf = null
    }
    await this.mapRenderComplete
    try{
      let des = (await this.storeData)["map"]["shelfAssociates"][x.shelfLocation][x.shelfColumn]
      if (des == undefined){
        throw "undefined destination"
      }
      this.computedPath = await dijkstraConvex.dijkstra(this.location.map(x => x*this.mapWidth), (await this.storeData)["map"]["shelfAssociates"][x.shelfLocation][x.shelfColumn])
    }
    catch(e){
      this.computedPath = null
    }
    this.generateHighlight()
    fetchData.mapHighlightStream.callback({
      shelfHighlight: this.mapHighlight,
      pathHighlight: this.pathHighlight,
      locHighlight: this.locHighlight
    })
  }

  renderRecOP = (navigator) => async (x) => {
    await this.renderItemOP.bind(this)(x)
    navigator.goBack(null)
  }

  mapCanvasOP(x){
    this.location = [x.nativeEvent.locationX/this.width, 1-x.nativeEvent.locationY/this.width]
    let loc = this.makeCircle()
    this.locHighlight = loc
    fetchData.mapHighlightStream.callback({
      shelfHighlight: this.mapHighlight,
      pathHighlight: this.pathHighlight,
      locHighlight: this.locHighlight
    })
    this.setState({
      locHighlight: loc
    })
    this.renderItemOP(this.selectedItem)
  }

  renderItem(x, i){ 
    return <Cell key={i} cellStyle="RightDetail" title={x.itemName} detail={x.friendlyLocation} onPress = {() => this.renderItemOP.bind(this)(x)}/>
  }

  renderRec = (navigator) => (x, i) => {
    return <Cell key={i} cellStyle="RightDetail" title={x.itemName} detail={x.friendlyLocation} onPress = {() => this.renderRecOP.bind(this)(navigator)(x)}/>
  }

  makeTableView(){ 
    this.resultCells = this.rankingResults.map(this.renderItem.bind(this))
    return <TableView>
      <Section>
        {this.resultCells}
      </Section>
    </TableView>
  }

  makeRecTable = (navigator) => (recommendations) => {
    return <TableView>
      <Section>
        {recommendations.map(this.renderRec.bind(this)(navigator))}
      </Section>
    </TableView>
  }

  makePolygon(x, i){
    return (
      <Polygon
        key={i}
        points={x.map(x => [x[0], this.mapWidth-x[1]].map(x => x*this.width/this.mapWidth).join(",")).join(" ")}
        fill="lime"
        stroke="purple"
        strokeWidth="1"
      />
    )
  }

  makeHighlight(x){
    return (
      <Polygon
        points={x.map(x => [x[0], this.mapWidth-x[1]].map(x => x*this.width/this.mapWidth).join(",")).join(" ")}
        fill="red"
        stroke="purple"
        strokeWidth="1"
      />
    )
  }

  makePolyline(x){
    return (
      <Polyline
        points={x.map(x => [x[0], this.mapWidth-x[1]].map(x => x*this.width/this.mapWidth).join(",")).join(" ")}
        fill="none"
        stroke="blue"
        strokeWidth="3"
      />
    )
  }

  makeCircle(){
    return (
      <Circle
        cx={this.location[0]*this.width}
        cy={(1-this.location[1])*this.width}
        r={this.width/50}
        stroke="grey"
        strokeWidth="1"
        fill="blue"
      />
    )
  }

  async generateMap(){ 
    this.storeData = await this.storeData
    this.mapWidth = this.storeData.map.temporaryScale
    let pma = helperFunctions.flattenList(Object.values(this.storeData["map"]["shelfMap"])).map(this.makePolygon.bind(this)) 
    this.polygonMap = pma
    this.setState({
      polygonMap: pma
    })
    fetchData.mapBaseStream.callback(pma)
  }

  async getMap(){
    await this.mapRenderComplete
    return this.polygonMap
  }

  generateHighlight(){
    var savedSD = fetchData.StateData.SelectedShelf
    try {
      let hil = this.makeHighlight(savedSD)
      this.mapHighlight = hil
      this.setState({
        shelfHighlight: hil
      })
    }
    catch(e){
      this.mapHighlight = null
      this.setState({
        shelfHighlight: null
      })
    }
    try {
      let hil = this.makePolyline(this.computedPath)
      this.pathHighlight = hil
      this.setState({
        pathHighlight: hil
      })
    }
    catch(e){
      this.pathHighlight = null
      this.setState({
        pathHighlight: null
      })
    }
  }

  displaySearchResults(){ 
    this.renderItemOP.bind(this)(this.rankingResults[0])
    var cells = this.makeTableView.bind(this)()
    this.setState({
      cells: cells
    })
    if (this.state.nextScreen){
      this.navigateto('Result', {'name': 'Search Results', 'resultcells': cells, 'mapCanvasOP': this.mapCanvasOP.bind(this), 'getRec': this.getRec.bind(this)})
    }
  }

  async refreshResultCells(stageCompletion){
    await stageCompletion
    return this.state.cells
  }

  async refreshSearchResults(){
    if (!this.rankingResults){
      return
    }
    this.rankingResults = (await this.searchRanker)(this.asrText)
    var cells = this.makeTableView.bind(this)()
    this.setState({
      cells: cells
    })
    fetchData.searchCellsStream.callback(cells)
  }

  async stopAudioRecording(){
    if (!this.sstopRecordingEnable){
      return
    }
    this.sstopRecordingEnable = false
    this.radialAnimation.stop()
    setTimeout(() => this.setState({ animatedOpacity: new Animated.Value(1) }), 0)
    this.setState({
      isRecording: false
    })
    await this.recording.stopAndUnloadAsync();
    const rec = this.recording
    this.startRecordingEnable = true 
    const recuri = rec.getURI()
    const info = await FileSystem.getInfoAsync(recuri)
    const { sound, status } = await rec.createNewLoadedSound()
    this.sound = sound;
    this.setState({
      soundLoaded: true
    })
    await Promise.all([fetchData.getAsrText(recuri), this.searchRanker, this.storeData]);
  }

  async startPlaying(){ 
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    })
    this.sound.playAsync();
    this.setState({
      audioPlaying: true
    })
  }

  getRanker(){
    return searchRanker.getRanker()
  }

  getRecommender(){
    return recommender.getRecommender()
  }

  stopPlaying(){ 
    this.sound.stopAsync();
    this.setState({
      audioPlaying: false
    })
  }

  swapScreen(){ 
    this.setState({
      nextScreen: !this.state.nextScreen
    })
  }

  recordingIndicator(){ 
    if (this.state.isRecording){
      return <Text>Recording</Text>
    }
    else{
      return <Text>Not Recording</Text>
    }
  }

  imageRecordingButton(){ 
    if (!this.state.isRecording){
      return <TouchableHighlight
        onPress={this.startAudioRecording.bind(this)}
        style={{height: 250, width: 250, borderRadius: 125}}>
        <Image
          style={{width: 250, height: 250}}
          source={fetchData.Images.notRecording}
          />
      </TouchableHighlight>
    }
    else{
      return <TouchableHighlight
        onPress={this.stopAudioRecording.bind(this)}
        style={{height: 250, width: 250, borderRadius: 125}}>
        <View>
          <Animated.Image
            style={{opacity: Animated.add(6, Animated.multiply(this.state.animatedOpacity, -5)), width: 250, height: 250, left: 0, top: 0, transform: [{scale: this.state.animatedOpacity}]}}
            source={fetchData.Images.animationRipple}
            />
          <Image
            style={{width: 250, height: 250, position: "absolute", left: 0, top: 0}}
            source={fetchData.Images.recording}
            />
          </View>
      </TouchableHighlight>
    }
  }

  recordingButton(){ 
    if (!this.state.isRecording){
      return <Button
        onPress={this.startAudioRecording.bind(this)}
        title="Find Item"
        color="#841584"
      />
    }
    else{
      return <Button
        onPress={this.stopAudioRecording.bind(this)}
        title="Stop Recording"
        color="#841584"
      />
    }
  }

  playbackButton(){ 
    if (this.state.soundLoaded){
      if (this.state.audioPlaying){
        return <Button
        onPress={this.stopPlaying.bind(this)}
        title="Stop Playing"
        color="#841584"
      />
      }
      else{
        return <Button
        onPress={this.startPlaying.bind(this)}
        title="Start Playing"
        color="#841584"
      />
      }
    }
  }

  resultButton(){ 
    if (this.state.nextScreen){
      return <Button
        onPress={this.swapScreen.bind(this)}
        title="Display results on this screen"
        color="#841584"
      />
    }
    else{
      return <Button
        onPress={this.swapScreen.bind(this)}
        title="Display results on next screen"
        color="#841584"
      />
    }
  }

  textIndicator(){ 
    if (this.state.asrLoaded){
      return <Text>{this.asrText}</Text>
    }
  }

  updateServerURL(text){ 
    this.setState({
      serverURL: text
    })
    fetchData.StateData.ServerURL = text
  }

  getRec = (navigator) => async () => {
    if (this.selectedItem == null) {
      return
    }
    this.recommender = await this.recommender
    if (!this.mounted) {
      return
    }
    navigator.navigate('Sparse', {'name': 'Recommendations', 'cells': this.makeRecTable.bind(this)(navigator)(this.recommender(this.selectedItem))})
  }

  render() { 
    const { navigate } = this.props.navigation
    this.navigateto = navigate
    let animatedOpacity = this.state.animatedOpacity
    let indicator = this.recordingIndicator()
    let recbutton = this.recordingButton()
    let playback = this.playbackButton()
    let rebutton = this.resultButton()
    let tedicator = this.textIndicator()
    let map = this.state.polygonMap
    let hil = this.state.shelfHighlight
    let phi = this.state.pathHighlight
    let loc = this.state.locHighlight
    let irecbutto = this.imageRecordingButton()
    return (
      <View style={styles.container}>
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View>
              <View style={styles.welcomeContainer}>
                <Text>{"Server URL"}</Text>
                <TextInput
                  editable={true}
                  multiline={true}
                  numberOfLines={4}
                  onChangeText={(text) => this.updateServerURL.bind(this)(text)}
                  style={{height: 50, width: this.width, backgroundColor: '#dddddd'}}
                  value={this.state.serverURL}
                  placeholder={"Server URL"}
                />
              </View>
              {recbutton}
              <View style={styles.welcomeContainer}>
                {indicator}
                {tedicator}
              </View>
              {playback}
              <View style={styles.welcomeContainer}>
                <View>
                  <Image
                    style={{width: 250, height: 250, position: "absolute", left: 0, top: 0}}
                    source={fetchData.Images.notRecording}
                    />
                  {irecbutto}
                </View>
              </View>
              {rebutton}
              <Button
                onPress={() => {this.renderItemOP.bind(this)({})}}
                title="Clear map highlight"
                color="#841584"
              />
              <Button
                onPress={fetchData.fupdate}
                title="Fake update"
                color="#841584"
              />
              <Button
                onPress={() => {fetchData.toggleInterval(); this.setState({})}}
                title={fetchData.intervalActive() ? "Disable refresh interval" : "Enable refresh interval"}
                color="#841584"
              />
              <Button
                title="Navigation Test"
                onPress={() =>
                  navigate('Result', {'name': 'Whenever is a mantra I live for', 'resultcells': this.state.cells, 'mapCanvasOP': this.mapCanvasOP.bind(this), 'getRec': this.getRec.bind(this)})
                }
              />
              <Button
                title="Check Accuracy"
                onPress={() =>
                  navigate('Accuracy', {'name': 'Check Accuracy'})
                }
              />
              {this.state.nextScreen ? false : <Button
                title="Get Recommendations"
                onPress={this.getRec(this.props.navigation).bind(this)}
              />}
              {this.state.nextScreen ? false : this.state.cells}
              <View style={styles.welcomeContainer}>
                <Text>{"Map, map, I'm a map"}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={1}
                onPress={this.mapCanvasOP.bind(this)}
              >
                <Svg
                  height={this.width}
                  width={this.width}
                >
                {map}
                {hil}
                {phi}
                {loc}
                </Svg>
              </TouchableOpacity>
            </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  developmentModeText: {
    marginBottom: 20,
    color: 'rgba(0,0,0,0.4)',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  contentContainer: {
    paddingTop: 30,
  },
  welcomeContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  welcomeImage: {
    width: 100,
    height: 80,
    resizeMode: 'contain',
    marginTop: 3,
    marginLeft: -10,
  },
  getStartedContainer: {
    alignItems: 'center',
    marginHorizontal: 50,
  },
  homeScreenFilename: {
    marginVertical: 7,
  },
  codeHighlightText: {
    color: 'rgba(96,100,109, 0.8)',
  },
  codeHighlightContainer: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 3,
    paddingHorizontal: 4,
  },
  getStartedText: {
    fontSize: 17,
    color: 'rgba(96,100,109, 1)',
    lineHeight: 24,
    textAlign: 'center',
  },
  tabBarInfoContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    ...Platform.select({
      ios: {
        shadowColor: 'black',
        shadowOffset: { height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 20,
      },
    }),
    alignItems: 'center',
    backgroundColor: '#fbfbfb',
    paddingVertical: 20,
  },
  tabBarInfoText: {
    fontSize: 17,
    color: 'rgba(96,100,109, 1)',
    textAlign: 'center',
  },
  navigationFilename: {
    marginTop: 5,
  },
  helpContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  helpLink: {
    paddingVertical: 15,
  },
  helpLinkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});

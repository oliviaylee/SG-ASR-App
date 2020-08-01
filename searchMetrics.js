import { storeData } from './fetchData.js'
var normalizationPassMaximumFrequency = (tagcollection, tf_, idf) => {
  for (var i = 0; i < tagcollection.length; i++){
    var tags = tagcollection[i]["tags"]
    var tfi = tf_[i]
    var mft = 0
    Object.keys(tfi).map((x) => {mft = Math.max(mft, tfi[x])})
    mft == 0 ? null : Object.keys(tfi).map((x) => {tfi[x] = 0.5 + 0.5*tfi[x]/mft})
  }
}
var normalizationPassLogarithmic = (tagcollection, tf_, idf) => {
  for (var i = 0; i < tagcollection.length; i++){
    var tags = tagcollection[i]["tags"]
    var tfi = tf_[i]
    Object.keys(tfi).map((x) => {tfi[x] = (Math.log(tfi[x]+1))})
  }
}
var normalizationPass = (tagcollection, tf_, idf) => { 
  for (var i = 0; i < tagcollection.length; i++){
    var tags = tagcollection[i]["tags"]
    var tfi = tf_[i]
    Object.keys(tfi).map((x) => {tfi[x] = tfi[x]/tags.length})
  }
}
var computeTfIdfs = (tagcollection, tf_, idf) => {
  for (var i = 0; i < tagcollection.length; i++){
    var tags = tagcollection[i]["tags"];
    var adda = {}
    for (var j = 0; j < tags.length; j++){
      if (!adda[tags[j]]){
        if (!idf[tags[j]]){
          idf[tags[j]] = 0
        }
        idf[tags[j]]++
        adda[tags[j]] = 0
      }
      adda[tags[j]] += 1
    }
    tf_.push(adda)
  }
  iks = Object.keys(idf)
  for (var i = 0; i < iks.length; i++){
    if (idf[iks[i]]){
      idf[iks[i]] = Math.log(tagcollection.length/idf[iks[i]])
    }
    else{
      idf[iks[i]] = 0
    }
  }
}
var makeRanker = (data) => {
  var run = 0
  var idf = {}
  var tf_ = []
  return (terms) => {
    var terms = terms.toLowerCase().split(" ")
    if (!run){
      computeTfIdfs(data, tf_, idf)
      normalizationPass(data, tf_, idf)
      run = 1
    }
    var ret = []
    for (var i = 0; i < data.length; i++){
      ret.push([0, 0, i, data[i]])
    }
    for (var i = 0; i < terms.length; i++){
      var term = terms[i]
      console.log(term)
      for (var j = 0; j < data.length; j++){
        if (tf_[j][term]){
          console.log(tf_[j][term])
          console.log(idf[term])
          ret[j][0] -= tf_[j][term] * idf[term]
          ret[j][1] -= tf_[j][term]
        }
      }
    }
    ret = ret.sort((a, b) => {
      var i = 0;
      while(a[i] == b[i]){
        i++;
      }
      return a[i]-b[i]
    }).map(x => x[3])
    return ret
  }
}
var ranker = makeRanker(storeData)
var validators = {
  topcontains: (top) => (expected, rankings) => {
    var rankingscontain = {}
    rankings.slice(0, top).map((x) => {rankingscontain[x.iuid] = true})
    var score = expected.length == 0 ? 1 : 0
    expected.map((v) => {rankingscontain[v] ? score += 1/expected.length : null})
    return score*(2-score)
  },
  rankingsum: (expected, rankings) => {
    var rankingindices = {}
    rankings.map((x, i) => {rankingindices[x.iuid] = i})
    var score = 0
    var cexpected = []
    expected.map(v => {rankingindices[v] ? cexpected.push(v) : null})
    cexpected.map((v, i) => {score += rankingindices[v]-i})
    var worst = (rankings.length-expected.length)*expected.length
    score = (worst-score)/worst
    return score*(2-score)
  }
}

var testset = [
    {query: "Where is the Rosemary", expected: [15], validator: validators.topcontains(5)},
    {query: "I want food and I want it now", expected: [10, 15, 17], validator: validators.topcontains(5)},
    {query: "Bad query", expected: [13], validator: validators.topcontains(5)}
]
var accuracyChecker = (override) => {
    var score = 0
    testset.map(x => override ? override(x.expected, ranker(x.query)) : x.validator(x.expected, ranker(x.query))).map(x => {score += x})
    return score/testset.length
}
console.log(accuracyChecker())
//console.log(accuracyChecker(validators.rankingsum))
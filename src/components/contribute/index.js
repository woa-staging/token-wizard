import React from 'react'
import {
  getCurrentAccount,
  checkNetWorkByID,
  checkTxMined,
  sendTXToContract,
  calculateGasLimit,
  attachToSpecificCrowdsaleContract,
  methodToExec,
  getCrowdsaleStrategy
} from '../../utils/blockchainHelpers'
import {
  getTokenData,
  getCrowdsaleData,
  getCrowdsaleTargetDates,
  initializeAccumulativeData,
  isFinalized,
  toBigNumber,
  getUserMaxLimits,
  getUserMinLimits
} from '../crowdsale/utils'
import { countDecimalPlaces, getQueryVariable, toast } from '../../utils/utils'
import { getCrowdsaleAssets } from '../../stores/utils'
import {
  contributionDisabledAlertInTime,
  noGasPriceAvailable,
  MetaMaskIsLockedAlert,
  successfulContributionAlert,
  noMoreTokensAvailable,
  notAllowedContributor
} from '../../utils/alerts'
import { Loader } from '../Common/Loader'
import { CrowdsaleConfig } from '../Common/config'
import { CONTRIBUTION_OPTIONS, TOAST } from '../../utils/constants'
import { inject, observer } from 'mobx-react'
import { toJS } from 'mobx'
import QRPaymentProcess from './QRPaymentProcess'
import CountdownTimer from './CountdownTimer'
import classNames from 'classnames'
import moment from 'moment'
import { BigNumber } from 'bignumber.js'
import { Form } from 'react-final-form'
import { ContributeForm } from './ContributeForm'
import { generateContext } from '../stepFour/utils'

@inject(
  'contractStore',
  'crowdsalePageStore',
  'web3Store',
  'tierStore',
  'tokenStore',
  'generalStore',
  'contributeStore',
  'gasPriceStore',
  'crowdsaleStore'
)
@observer
export class Contribute extends React.Component {
  constructor(props) {
    super(props)
    window.scrollTo(0, 0)

    this.state = {
      loading: true,
      pristineTokenInput: true,
      web3Available: false,
      contributeThrough: CONTRIBUTION_OPTIONS.QR,
      crowdsaleExecID: CrowdsaleConfig.crowdsaleContractURL || getQueryVariable('exec-id'),
      toNextTick: {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      },
      nextTick: {},
      msToNextTick: 0,
      displaySeconds: false,
      isFinalized: false
    }
  }

  componentDidMount () {
    const { web3Store, gasPriceStore, generalStore, crowdsaleStore } = this.props
    const { web3 } = web3Store

    if (!web3) {
      this.setState({ loading: false })
      return
    }

    const networkID = CrowdsaleConfig.networkID ? CrowdsaleConfig.networkID : getQueryVariable('networkID')
    checkNetWorkByID(networkID)

    this.setState({
      web3Available: true,
      contributeThrough: CONTRIBUTION_OPTIONS.METAMASK
    })

    getCrowdsaleAssets(networkID)
      .then(_newState => {
        this.setState(_newState)
      })
      .then(() => getCrowdsaleStrategy(this.state.crowdsaleExecID))
      .then((strategy) => crowdsaleStore.setProperty('strategy', strategy))
      //.then((strategy) => crowdsaleStore.setProperty('strategy', CROWDSALE_STRATEGIES.MINTED_CAPPED_CROWDSALE)) //to do
      .then(() => {
        this.extractContractsData()
        gasPriceStore.updateValues()
          .then(() => generalStore.setGasPrice(gasPriceStore.slow.price))
          .catch(() => noGasPriceAvailable())
      })
  }

  componentWillUnmount () {
    this.clearTimeInterval()
  }

  extractContractsData() {
    const { contractStore, web3Store, crowdsaleStore } = this.props
    const { web3 } = web3Store

    const crowdsaleExecID = CrowdsaleConfig.crowdsaleContractURL ? CrowdsaleConfig.crowdsaleContractURL : getQueryVariable('exec-id')

    //to do
    /*if (!web3.utils.isAddress(crowdsaleAddr)) {
      this.setState({ loading: false })
      return invalidCrowdsaleAddrAlert()
    }*/

    getCurrentAccount()
      .then(account => {
        console.log("crowdsaleExecID:", crowdsaleExecID)
        contractStore.setContractProperty('crowdsale', 'execID', crowdsaleExecID)
        contractStore.setContractProperty('crowdsale', 'account', account)

        this.setState({
          curAddr: account,
          web3
        })

        if (!contractStore.crowdsale.execID) {
          this.setState({ loading: false })
          return
        }

        const targetPrefix = "initCrowdsale"
        const targetSuffix = crowdsaleStore.contractTargetSuffix
        const target = `${targetPrefix}${targetSuffix}`

        attachToSpecificCrowdsaleContract(target)
          .then((initCrowdsaleContract) => {
            initializeAccumulativeData()
            .then(() => getTokenData(initCrowdsaleContract, crowdsaleExecID, account))
            .then(() => getCrowdsaleData(initCrowdsaleContract, crowdsaleExecID, account, crowdsaleStore))
            .then(() => getCrowdsaleTargetDates(initCrowdsaleContract, crowdsaleExecID))
            .then(() => this.checkIsFinalized(initCrowdsaleContract, crowdsaleExecID))
            .then(() => this.calculateMinContribution())
            .then(() => this.setTimers())
            .catch(err => {
              this.setState({ loading: false })
              console.log(err)
            })
            .then(() => this.setState({ loading: false }))
          })
          .catch(err => {
            this.setState({ loading: false })
            console.log(err)
          })
      })
      .catch(err => {
        this.setState({ loading: false })
        console.log(err)
      })
  }

  checkIsFinalized(initCrowdsaleContract, crowdsaleExecID) {
    return isFinalized(initCrowdsaleContract, crowdsaleExecID)
      .then(isFinalized => {
        this.setState({ isFinalized })
      })
  }

  setTimers = () => {
    const { crowdsalePageStore } = this.props
    let nextTick = 0
    let millisecondsToNextTick = 0
    let timeInterval

    if (crowdsalePageStore.ticks.length) {
      nextTick = crowdsalePageStore.extractNextTick()
      millisecondsToNextTick = nextTick.time - Date.now()
      const FIVE_MINUTES_BEFORE_TICK = moment(millisecondsToNextTick).subtract(5, 'minutes').valueOf()
      const ONE_DAY = 24 * 3600 * 1000

      if (FIVE_MINUTES_BEFORE_TICK < ONE_DAY) {
        setTimeout(() => {
          this.setState({ displaySeconds: true })
        }, FIVE_MINUTES_BEFORE_TICK)
      }

      timeInterval = setInterval(() => {
        const time = moment.duration(this.state.nextTick.time - Date.now())

        this.setState({
          toNextTick: {
            days: Math.floor(time.asDays()) || 0,
            hours: time.hours() || 0,
            minutes: time.minutes() || 0,
            seconds: time.seconds() || 0
          }
        })
      }, 1000)
    }


    this.setState({
      nextTick,
      msToNextTick: millisecondsToNextTick,
      displaySeconds: false,
      timeInterval
    })

  }

  resetTimers = () => {
    this.clearTimeInterval()
    this.setTimers()
  }

  clearTimeInterval = () => {
    if (this.state.timeInterval) clearInterval(this.state.timeInterval)
  }

  contributeToTokens = () => {
    const { contributeStore, crowdsalePageStore, web3Store } = this.props
    const { startDate } = crowdsalePageStore
    const { web3 } = web3Store

    if (!this.isValidToken(contributeStore.tokensToContribute)) {
      this.setState({ pristineTokenInput: false })
      return
    }

    this.setState({ loading: true })

    if (!startDate) {
      this.setState({ loading: false })
      return
    }

    if (web3.eth.accounts.length === 0) {
      this.setState({ loading: false })
      return MetaMaskIsLockedAlert()
    }

    this.contributeToTokensForWhitelistedCrowdsale()
  }

  contributeToTokensForWhitelistedCrowdsale = () => {
    const { crowdsalePageStore } = this.props

    if (crowdsalePageStore.startDate > (new Date()).getTime()) {
      this.setState({ loading: false })
      return contributionDisabledAlertInTime(crowdsalePageStore.startDate)
    }

    this.contributeToTokensForWhitelistedCrowdsaleInternal()
  }

  getBuyParams = (weiToSend, methodInterface) => {
    const { web3Store } = this.props
    const { web3 } = web3Store
    let context = generateContext(weiToSend);
    let encodedParameters = web3.eth.abi.encodeParameters(methodInterface, [context]);
    return encodedParameters;
  }

  calculateWeiToSend = async () => {
    const { crowdsalePageStore, crowdsaleStore, contractStore, contributeStore } = this.props
    const { execID, account } = this.props.contractStore.crowdsale
    const { addr } = toJS(contractStore.registryStorage)

    const targetPrefix = "initCrowdsale"
    const targetSuffix = crowdsaleStore.contractTargetSuffix
    const target = `${targetPrefix}${targetSuffix}`

    const { methods } = await attachToSpecificCrowdsaleContract(target)

    if (crowdsaleStore.isMintedCappedCrowdsale) {
      const { tier_price } = await methods.getCurrentTierInfo(addr, execID).call()
      console.log('tier_price:', tier_price)
      crowdsalePageStore.setProperty('rate', tier_price) //should be one token in wei

    } else if (crowdsaleStore.isDutchAuction) {
      const { current_rate } = await methods.getCrowdsaleStatus(addr, execID).call()
      console.log('current_rate:', current_rate)
      crowdsalePageStore.setProperty('rate', current_rate) //should be one token in wei
    }

    // rate is from contract. It is already in wei. How much 1 token costs in wei.
    const rate = toBigNumber(crowdsalePageStore.rate)
    console.log('rate:', rate.toFixed())

    const tokensToContribute = toBigNumber(contributeStore.tokensToContribute).times(rate)
    console.log('tokensToContribute:', tokensToContribute.toFixed())

    const userLimits = await getUserMaxLimits(addr, execID, methods, account)

    return tokensToContribute.gt(userLimits) ? userLimits : tokensToContribute
  }

  calculateMinContribution = async () => {
    const { crowdsaleStore, contractStore } = this.props
    const { execID, account } = this.props.contractStore.crowdsale
    const { addr } = toJS(contractStore.registryStorage)

    const targetPrefix = "initCrowdsale"
    const targetSuffix = crowdsaleStore.contractTargetSuffix
    const target = `${targetPrefix}${targetSuffix}`

    const { methods } = await attachToSpecificCrowdsaleContract(target)
    const userMinLimits = await getUserMinLimits(addr, execID, methods, account)

    this.setState({ minimumContribution: userMinLimits.toFixed() })
  }

  contributeToTokensForWhitelistedCrowdsaleInternal = async () => {
    if (this.state.minimumContribution < 0) {
      this.setState({ loading: false })
      return notAllowedContributor()
    }

    const { generalStore, crowdsaleStore, contractStore, crowdsalePageStore, tokenStore } = this.props
    const { account } = contractStore.crowdsale

    const weiToSend = await this.calculateWeiToSend()
    console.log('weiToSend:', weiToSend.toFixed())

    if (weiToSend.eq('0')) {
      this.setState({ loading: false })
      return noMoreTokensAvailable()
    }

    const opts = {
      from: account,
      value: weiToSend.integerValue(BigNumber.ROUND_CEIL),
      gasPrice: generalStore.gasPrice
    }
    console.log(opts)

    let methodInterface = ["bytes"];

    const targetPrefix = "crowdsaleBuyTokens"
    const targetSuffix = crowdsaleStore.contractTargetSuffix
    const target = `${targetPrefix}${targetSuffix}`

    let paramsToExec = [opts.value, methodInterface]
    const method = methodToExec("scriptExec", `buy(${methodInterface.join(',')})`, target, this.getBuyParams, paramsToExec)

    const estimatedGas = await method.estimateGas(opts)
    console.log('estimatedGas:', estimatedGas)

    opts.gasLimit = calculateGasLimit(estimatedGas)

    const { DECIMAL_PLACES } = weiToSend.constructor.config()
    weiToSend.constructor.config({ DECIMAL_PLACES: +tokenStore.decimals })

    const tokensToContribute = weiToSend.div(crowdsalePageStore.rate).toFixed()
    weiToSend.constructor.config({ DECIMAL_PLACES })

    sendTXToContract(method.send(opts))
      .then(() => successfulContributionAlert(tokensToContribute))
      .catch(err => {
        console.error(err)
        return toast.showToaster({ type: TOAST.TYPE.ERROR, message: TOAST.MESSAGE.TRANSACTION_FAILED })
      })
      .then(() => this.setState({ loading: false }))
  }

  txMinedCallback(txHash, receipt) {
    const { contributeStore } = this.props

    if (receipt) {
      if (receipt.blockNumber) {
        this.setState({ loading: false })
        successfulContributionAlert(contributeStore.tokensToContribute)
      }
    } else {
      setTimeout(() => {
        checkTxMined(txHash, receipt => this.txMinedCallback(txHash, receipt))
      }, 500)
    }
  }

  updateContributeThrough = (contributeThrough) => {
    this.setState({ contributeThrough })
  }

  isValidToken(token) {
    return +token > 0 && countDecimalPlaces(token) <= this.props.tokenStore.decimals
  }

  render () {
    const { crowdsalePageStore, tokenStore, contractStore } = this.props
    const { tokenAmountOf } = crowdsalePageStore
    const { crowdsale } = contractStore

    const { curAddr, contributeThrough, crowdsaleExecID, web3Available, toNextTick, nextTick, minimumContribution } = this.state
    const { days, hours, minutes, seconds } = toNextTick

    const { decimals, ticker, name } = tokenStore

    const tokenDecimals = !isNaN(decimals) ? decimals : 0
    const tokenTicker = ticker ? ticker.toString() : ''
    const tokenName = name ? name.toString() : ''
    const maximumSellableTokens = toBigNumber(crowdsalePageStore.maximumSellableTokens)
    const maxCapBeforeDecimals = toBigNumber(maximumSellableTokens).div(`1e${tokenDecimals}`)

    //balance
    const contributorBalance = tokenAmountOf ? toBigNumber(tokenAmountOf).div(`1e${tokenDecimals}`).toFixed() : '0'

    //total supply
    const totalSupply = maxCapBeforeDecimals.toFixed()

    //min contribution
    const minimumContributionDisplay = minimumContribution >= 0 ? `${minimumContribution} ${tokenTicker}` : 'You are not allowed'

    const QRPaymentProcessElement = contributeThrough === CONTRIBUTION_OPTIONS.QR ?
      <QRPaymentProcess crowdsaleExecID={crowdsaleExecID} /> :
      null

    const rightColumnClasses = classNames('contribute-table-cell', 'contribute-table-cell_right', {
      'qr-selected': contributeThrough === CONTRIBUTION_OPTIONS.QR
    })

    return <div className="contribute container">
      <div className="contribute-table">
        <div className="contribute-table-cell contribute-table-cell_left">
          <CountdownTimer
            displaySeconds={this.state.displaySeconds}
            nextTick={nextTick}
            tiersLength={crowdsalePageStore && crowdsalePageStore.tiers.length}
            days={days}
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            msToNextTick={this.state.msToNextTick}
            onComplete={this.resetTimers}
            isFinalized={this.state.isFinalized}
          />
          <div className="hashes">
            <div className="hashes-i">
              <p className="hashes-title">{curAddr}</p>
              <p className="hashes-description">Current Account</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{crowdsale && crowdsale.execID}</p>
              <p className="hashes-description">Crowdsale Execution ID</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{tokenName}</p>
              <p className="hashes-description">Name</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{tokenTicker}</p>
              <p className="hashes-description">Ticker</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{totalSupply} {tokenTicker}</p>
              <p className="hashes-description">Total Supply</p>
            </div>
            <div className="hashes-i">
              <p className="hashes-title">{minimumContributionDisplay}</p>
              <p className="hashes-description">Minimum Contribution</p>
            </div>
          </div>
          <p className="contribute-title">Contribute page</p>
          <p className="contribute-description">
            {'Here you can contribute in the crowdsale campaign. At the moment, you need Metamask client to contribute into the crowdsale.'}
          </p>
        </div>
        <div className={rightColumnClasses}>
          <div className="balance">
            <p className="balance-title">{contributorBalance} {tokenTicker}</p>
            <p className="balance-description">Balance</p>
            <p className="description">
              Your balance in tokens.
            </p>
          </div>
          <Form
            onSubmit={this.contributeToTokens}
            component={ContributeForm}
            contributeThrough={contributeThrough}
            updateContributeThrough={this.updateContributeThrough}
            web3Available={web3Available}
            minimumContribution={minimumContribution}
          />
          {QRPaymentProcessElement}
        </div>
      </div>
      <Loader show={this.state.loading}></Loader>
    </div>
  }
}

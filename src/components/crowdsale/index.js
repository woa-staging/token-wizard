import React from 'react'
import '../../assets/stylesheets/application.css'
import {
  getCurrentAccount,
  checkNetWorkByID,
  checkWeb3,
  attachToSpecificCrowdsaleContract,
  getCrowdsaleStrategy
} from '../../utils/blockchainHelpers'
import {
  getContractStoreProperty,
  getCrowdsaleData,
  getTokenData,
  initializeAccumulativeData,
  toBigNumber
} from './utils'
import { getQueryVariable } from '../../utils/utils'
import { getCrowdsaleAssets } from '../../stores/utils'
import { StepNavigation } from '../Common/StepNavigation'
import { NAVIGATION_STEPS } from '../../utils/constants'
import { invalidCrowdsaleAddrAlert } from '../../utils/alerts'
import { Loader } from '../Common/Loader'
import { CrowdsaleConfig } from '../Common/config'
import { inject, observer } from 'mobx-react'

const { CROWDSALE_PAGE } = NAVIGATION_STEPS

@inject(
  'contractStore',
  'crowdsaleStore',
  'crowdsalePageStore',
  'web3Store',
  'tierStore',
  'tokenStore',
  'generalStore'
)
@observer
export class Crowdsale extends React.Component {
  constructor (props) {
    super(props)
    this.state = { loading: true }
  }

  componentDidMount () {
    checkWeb3()

    const networkID = CrowdsaleConfig.networkID ? CrowdsaleConfig.networkID : getQueryVariable('networkID')

    this.getCrowdsale(networkID)
  }

  getCrowdsale = (networkID) => {
    const { generalStore, web3Store, crowdsaleStore, contractStore } = this.props
    const { web3 } = web3Store

    if (!web3) {
      this.setState({ loading: false })
      return
    }

    checkNetWorkByID(networkID);
    generalStore.setProperty('networkID', networkID);

    const crowdsaleExecID = CrowdsaleConfig.crowdsaleContractURL ? CrowdsaleConfig.crowdsaleContractURL : getQueryVariable('exec-id')
    console.log("crowdsaleExecID:", crowdsaleExecID)
    contractStore.setContractProperty('crowdsale', 'execID', crowdsaleExecID)

    let account
    getCrowdsaleAssets(networkID)
      .then(getCurrentAccount)
      .then((_account) => { account = _account })
      .catch(err => {
        this.setState({ loading: false })
        console.log(err)
      })
      .then(() => getCrowdsaleStrategy(contractStore.crowdsale.execID))
      .then((strategy) => crowdsaleStore.setProperty('strategy', strategy))
      .then(() => this.extractContractsData(account))
      .catch(console.log)
  }

  extractContractsData = (account) => {
    const { contractStore, crowdsaleStore } = this.props
    //to do
    /*if (!web3.utils.isAddress(crowdsaleAddr)) {
      this.setState({ loading: false })
      return invalidCrowdsaleAddrAlert()
    }*/

    if (!contractStore.crowdsale.execID) {
      this.setState({ loading: false })
      return
    }

    const targetPrefix = "initCrowdsale"
    const targetSuffix = crowdsaleStore.contractTargetSuffix
    const target = `${targetPrefix}${targetSuffix}`
    console.log("target:", target)

    attachToSpecificCrowdsaleContract(target)
      .then((initCrowdsaleContract) => {
        this.getFullCrowdsaleData(initCrowdsaleContract, contractStore.crowdsale.execID, account)
          .then(() => this.setState({ loading: false }))
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

  getFullCrowdsaleData = (initCrowdsaleContract, crowdsaleExecID, account) => {
    return getTokenData(initCrowdsaleContract, crowdsaleExecID, account)
    .then(() => getCrowdsaleData(initCrowdsaleContract, crowdsaleExecID, account))
    .then(() => initializeAccumulativeData())
    .then(() => {
      this.setState({ loading: false })
    })
    .catch(err => {
      this.setState({ loading: false })
      console.log(err)
    })
  }

  goToContributePage = () => {
    const { contractStore, generalStore } = this.props
    let queryStr = "";
    if (!CrowdsaleConfig.crowdsaleContractURL || !CrowdsaleConfig.networkID) {
      if (contractStore.crowdsale.execID) {
        queryStr = "?exec-id=" + contractStore.crowdsale.execID;
        if (generalStore.networkID) {
          queryStr += "&networkID=" + generalStore.networkID;
        }
      }
    }

    this.props.history.push('/contribute' + queryStr);
  }

  render() {
    const { web3Store, tokenStore, crowdsalePageStore } = this.props
    const { web3 } = web3Store

    const crowdsaleExecID = getContractStoreProperty('crowdsale','execID')
    const contributorsCount = crowdsalePageStore.contributors ? crowdsalePageStore.contributors.toString() : 0

    const rate = toBigNumber(crowdsalePageStore.rate)
    const tokenDecimals = toBigNumber(tokenStore.decimals)
    const maximumSellableTokens = toBigNumber(crowdsalePageStore.maximumSellableTokens)
    const maximumSellableTokensInWei = toBigNumber(crowdsalePageStore.maximumSellableTokensInWei)
    const ethRaised = toBigNumber(crowdsalePageStore.ethRaised)
    const tokensSold = toBigNumber(crowdsalePageStore.tokensSold)
    const maxCapBeforeDecimals = maximumSellableTokens.div(`1e${tokenDecimals}`)

    // tokens claimed
    const tokensClaimedTiers = tokensSold.div(`1e${tokenDecimals}`).toFixed()
    const tokensClaimed = tokensClaimedTiers

    //price
    const rateInETH = toBigNumber(web3.utils.fromWei(rate.toFixed(), 'ether'))
    const tokensPerETH = rateInETH > 0 ? rateInETH.pow(-1).decimalPlaces(0).toFixed() : 0

    //total supply
    const totalSupply = maxCapBeforeDecimals.toFixed()

    //goal in ETH
    const goalInETHTiers = toBigNumber(web3.utils.fromWei(maximumSellableTokensInWei.toFixed(), 'ether')).toFixed()
    const goalInETH = goalInETHTiers
    const tokensClaimedRatio = goalInETH > 0 ? ethRaised.div(goalInETH).times(100).toFixed() : '0'

    const contributorsBlock = <div className="right">
      <p className="title">{`${contributorsCount}`}</p>
      <p className="description">Contributors</p>
    </div>

    return (
      <section className="steps steps_crowdsale-page">
        <StepNavigation activeStep={CROWDSALE_PAGE}/>
        <div className="steps-content container">
          <div className="about-step">
            <div className="step-icons step-icons_crowdsale-page"/>
            <p className="title">Crowdsale Page</p>
            <p className="description">Page with statistics of crowdsale. Statistics for all tiers combined on the page.
              Please press Ctrl-D to bookmark the page.</p>
          </div>
          <div className="total-funds">
            <div className="hidden">
              <div className="left">
                <p className="total-funds-title">{`${ethRaised}`} ETH</p>
                <p className="total-funds-description">Total Raised Funds</p>
              </div>
              <div className="right">
                <p className="total-funds-title">{`${goalInETH}`} ETH</p>
                <p className="total-funds-description">Goal</p>
              </div>
            </div>
          </div>
          <div className="total-funds-chart-container">
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart-division"/>
            <div className="total-funds-chart">
              <div className="total-funds-chart-active" style={{ width: `${tokensClaimedRatio}%` }}/>
            </div>
          </div>
          <div className="total-funds-statistics">
            <div className="hidden">
              <div className="left" style={{ width: '42% '}}>
                <div className="hidden">
                  <div className="left">
                    <p className="title">{`${tokensClaimed}`}</p>
                    <p className="description">Tokens Claimed</p>
                  </div>
                  { contributorsBlock }
                </div>
                <p className="hash">{`${crowdsaleExecID}`}</p>
                <p className="description">Crowdsale Execution ID</p>
              </div>
              <div className="right" style={{ width: '58%' }}>
                <div className="hidden">
                  <div className="left">
                    <p className="title">{`${tokensPerETH}`}</p>
                    <p className="description">Price (Tokens/ETH)</p>
                  </div>
                  <div className="right">
                    <p className="title">{`${totalSupply}`}</p>
                    <p className="description">Total Supply</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="button-container">
          <a onClick={this.goToContributePage} className="button button_fill">Contribute</a>
        </div>
        <Loader show={this.state.loading} />
      </section>
    )
  }
}
